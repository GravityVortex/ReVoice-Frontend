import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// Ensure .env is loaded when running via tsx/node (see src/config/index.ts)
import '../src/config';

import {
  javaR2MultipartAbort,
  javaR2MultipartComplete,
  javaR2MultipartInitiate,
  javaR2MultipartPresignPart,
} from '../src/shared/services/javaR2Multipart';

type Part = { partNumber: number; etag: string; size: number };

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const val = argv[i + 1];
    if (!val || val.startsWith('--')) {
      args[key] = 'true';
    } else {
      args[key] = val;
      i++;
    }
  }
  return args;
}

async function readFileChunk(fd: fs.FileHandle, start: number, length: number) {
  const buf = Buffer.allocUnsafe(length);
  const { bytesRead } = await fd.read(buf, 0, length, start);
  if (bytesRead !== length) return buf.subarray(0, bytesRead);
  return buf;
}

async function runPool<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let idx = 0;

  const worker = async () => {
    while (true) {
      const i = idx++;
      if (i >= tasks.length) return;
      results[i] = await tasks[i]!();
    }
  };

  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const filePath = args.file;
  const userId = args.userId || args.userid; // tolerate typo
  const chunkSizeMB = args.chunkSizeMB ? Number.parseFloat(args.chunkSizeMB) : 16;
  const concurrency = args.concurrency ? Number.parseInt(args.concurrency, 10) : 4;
  const expiresInSeconds = args.expiresInSeconds ? Number.parseInt(args.expiresInSeconds, 10) : 3600;
  const contentType = args.contentType || 'video/mp4';

  if (!filePath) {
    throw new Error('missing --file <path>');
  }
  if (!userId) {
    throw new Error('missing --userId <userId>');
  }
  if (!Number.isFinite(chunkSizeMB) || chunkSizeMB <= 0) {
    throw new Error('invalid --chunkSizeMB');
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) {
    throw new Error('invalid --concurrency (1..16)');
  }
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 60 || expiresInSeconds > 86400) {
    throw new Error('invalid --expiresInSeconds (60..86400)');
  }

  const absPath = path.resolve(filePath);
  const st = await fs.stat(absPath);
  assert.ok(st.isFile(), 'file is not a regular file');

  const filename = path.basename(absPath);
  const chunkSize = Math.floor(chunkSizeMB * 1024 * 1024);
  const totalParts = Math.ceil(st.size / chunkSize);

  console.log(
    `Uploading ${filename} (${(st.size / 1024 / 1024).toFixed(2)} MB) via Java multipart -> R2`
  );
  console.log(
    `userId=${userId}, chunkSize=${(chunkSize / 1024 / 1024).toFixed(2)}MB, parts=${totalParts}, concurrency=${concurrency}`
  );

  const init = await javaR2MultipartInitiate({
    userId,
    filename,
    contentType,
  });

  console.log(`initiate ok: uploadId=${init.uploadId}, fileId=${init.fileId}`);
  console.log(`key=${init.key}, bucket=${init.bucket}`);

  let aborted = false;
  const abort = async (why: string) => {
    if (aborted) return;
    aborted = true;
    console.log(`aborting multipart upload (${why})...`);
    try {
      await javaR2MultipartAbort({ userId, uploadId: init.uploadId, key: init.key });
      console.log('abort ok');
    } catch (e) {
      console.error('abort failed:', e);
    }
  };

  // Best-effort cleanup on ctrl-c / termination.
  process.once('SIGINT', () => {
    void abort('SIGINT').finally(() => process.exit(130));
  });
  process.once('SIGTERM', () => {
    void abort('SIGTERM').finally(() => process.exit(143));
  });

  const fd = await fs.open(absPath, 'r');
  try {
    let uploadedBytes = 0;
    const partsDone: boolean[] = new Array(totalParts).fill(false);

    const tasks: Array<() => Promise<Part>> = [];
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const start = (partNumber - 1) * chunkSize;
      const endExclusive = Math.min(start + chunkSize, st.size);
      const size = endExclusive - start;

      tasks.push(async () => {
        const presign = await javaR2MultipartPresignPart({
          userId,
          uploadId: init.uploadId,
          key: init.key,
          partNumber,
          expiresInSeconds,
        });

        const buf = await readFileChunk(fd, start, size);
        if (buf.length !== size) {
          throw new Error(`short read for part ${partNumber}: got=${buf.length}, want=${size}`);
        }

        const res = await fetch(presign.url, { method: 'PUT', body: buf });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`PUT part ${partNumber} failed: ${res.status} ${res.statusText} ${text}`);
        }

        const etag = (res.headers.get('etag') || '').replace(/"/g, '').trim();
        partsDone[partNumber - 1] = true;
        uploadedBytes += size;

        const pct = Math.round((uploadedBytes / st.size) * 100);
        console.log(`part ${partNumber}/${totalParts} ok (etag=${etag || 'n/a'}), ${pct}%`);

        return { partNumber, etag, size };
      });
    }

    let uploadedParts: Part[];
    try {
      uploadedParts = await runPool(tasks, concurrency);
    } catch (e: any) {
      await abort(e?.message || 'upload failed');
      throw e;
    }

    // Ensure all parts done; if not, fail early.
    assert.equal(
      partsDone.every(Boolean),
      true,
      'some parts did not finish (unexpected)'
    );

    // Java complete does not require parts, but sending ETags is harmless and helps debugging.
    const complete = await javaR2MultipartComplete({
      userId,
      uploadId: init.uploadId,
      key: init.key,
      parts: uploadedParts
        .sort((a, b) => a.partNumber - b.partNumber)
        .map((p) => ({ partNumber: p.partNumber, etag: p.etag })),
    });

    console.log(`complete ok: success=${complete.success}`);
    console.log(`downloadUrl=${complete.downloadUrl}`);

    // Lightweight verification: range GET 1 byte (avoid downloading full file).
    const verifyRes = await fetch(complete.downloadUrl, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
    });
    if (!(verifyRes.status === 206 || verifyRes.status === 200)) {
      console.warn(`verify GET returned ${verifyRes.status} ${verifyRes.statusText}`);
    } else {
      console.log('verify ok');
    }

    console.log('E2E upload finished: ok');
  } finally {
    await fd.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
