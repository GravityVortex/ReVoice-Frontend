import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Ensure .env is loaded when running via tsx/node (see src/config/index.ts)
import '../src/config';

import {
  javaR2MultipartAbort,
  javaR2MultipartComplete,
  javaR2MultipartInitiate,
  javaR2MultipartListParts,
  javaR2MultipartPresignPart,
} from '../src/shared/services/javaR2Multipart';
import { MULTIPART_KEY_V } from '../src/shared/lib/multipart-upload-contract';

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

function mb(n: number) {
  return n * 1024 * 1024;
}

async function putPart(url: string, size: number) {
  // Random data is fine: the server never inspects the payload.
  const body = crypto.randomBytes(size);
  const res = await fetch(url, { method: 'PUT', body });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`PUT failed: ${res.status} ${res.statusText} ${text}`);
  }
  return (res.headers.get('etag') || '').replace(/"/g, '').trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const userId = (args.userId || args.userid || `user_e2e_${crypto.randomUUID().slice(0, 8)}`).trim();
  const chunkSizeMB = args.chunkSizeMB ? Number.parseInt(args.chunkSizeMB, 10) : 8;
  const totalSizeMB = args.sizeMB ? Number.parseInt(args.sizeMB, 10) : 25;
  const expiresInSeconds = args.expiresInSeconds ? Number.parseInt(args.expiresInSeconds, 10) : 3600;

  assert.ok(userId && !userId.includes('/'), 'invalid userId');
  assert.ok(Number.isInteger(chunkSizeMB) && chunkSizeMB >= 5 && chunkSizeMB <= 128, 'invalid chunkSizeMB');
  assert.ok(Number.isInteger(totalSizeMB) && totalSizeMB >= 6 && totalSizeMB <= 512, 'invalid sizeMB');
  assert.ok(
    Number.isInteger(expiresInSeconds) && expiresInSeconds >= 60 && expiresInSeconds <= 86400,
    'invalid expiresInSeconds'
  );

  const chunkSize = mb(chunkSizeMB);
  const totalSize = mb(totalSizeMB);
  const partsCount = Math.ceil(totalSize / chunkSize);

  console.log(`java multipart contract e2e (real Java + real R2)`);
  console.log(`userId=${userId}, size=${totalSizeMB}MB, chunkSize=${chunkSizeMB}MB, parts=${partsCount}`);

  // Case 1: initiate -> list-parts empty -> upload 1 part -> list-parts contains that part -> abort ok.
  {
    const init = await javaR2MultipartInitiate({ userId, filename: 'e2e-contract.mp4', contentType: 'video/mp4' });
    try {
      assert.equal(init.keyV, MULTIPART_KEY_V);
      assert.ok(init.uploadId, 'missing uploadId');
      assert.ok(init.fileId, 'missing fileId');
      assert.ok(init.bucket, 'missing bucket');
      assert.ok(init.key.startsWith(`${userId}/`), 'key must start with userId/');
      assert.ok(init.key.endsWith(`/${MULTIPART_KEY_V}`), 'key must end with keyV');

      const before = await javaR2MultipartListParts({ userId, uploadId: init.uploadId, key: init.key });
      assert.deepEqual(before.parts, []);

      const pre = await javaR2MultipartPresignPart({
        userId,
        uploadId: init.uploadId,
        key: init.key,
        partNumber: 1,
        expiresInSeconds,
      });
      assert.equal(pre.partNumber, 1);
      assert.ok(pre.url.startsWith('http'), 'presign url must be http(s)');

      await putPart(pre.url, chunkSize);

      const after = await javaR2MultipartListParts({ userId, uploadId: init.uploadId, key: init.key });
      assert.equal(after.parts.length, 1);
      assert.equal(after.parts[0]?.partNumber, 1);
      assert.ok(after.parts[0]?.etag, 'etag should be present in list-parts');
    } finally {
      // Always cleanup: we don't need this upload session beyond verification.
      const aborted = await javaR2MultipartAbort({ userId, uploadId: init.uploadId, key: init.key });
      assert.equal(aborted.success, true);
    }
  }

  // Case 2: initiate -> complete without uploading parts => must fail with "No parts uploaded", then abort ok.
  {
    const init = await javaR2MultipartInitiate({
      userId,
      filename: 'e2e-contract-empty.mp4',
      contentType: 'video/mp4',
    });
    try {
      await assert.rejects(
        () => javaR2MultipartComplete({ userId, uploadId: init.uploadId, key: init.key }),
        /No parts uploaded/i
      );
    } finally {
      const aborted = await javaR2MultipartAbort({ userId, uploadId: init.uploadId, key: init.key });
      assert.equal(aborted.success, true);
    }
  }

  // Case 3: full upload -> complete WITHOUT passing parts (simulate browser can't read ETag) -> verify GET ok.
  {
    const init = await javaR2MultipartInitiate({ userId, filename: 'e2e-contract-full.mp4', contentType: 'video/mp4' });
    try {
      for (let partNumber = 1; partNumber <= partsCount; partNumber++) {
        const start = (partNumber - 1) * chunkSize;
        const size = Math.min(chunkSize, totalSize - start);
        const pre = await javaR2MultipartPresignPart({
          userId,
          uploadId: init.uploadId,
          key: init.key,
          partNumber,
          expiresInSeconds,
        });
        await putPart(pre.url, size);
      }

      const complete = await javaR2MultipartComplete({ userId, uploadId: init.uploadId, key: init.key });
      assert.equal(complete.success, true);
      assert.equal(complete.keyV, MULTIPART_KEY_V);
      assert.ok(complete.downloadUrl, 'missing downloadUrl');

      const verifyRes = await fetch(complete.downloadUrl, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
      });
      assert.ok(
        verifyRes.status === 206 || verifyRes.status === 200,
        `verify GET unexpected status: ${verifyRes.status} ${verifyRes.statusText}`
      );
    } catch (e) {
      // Best-effort cleanup to avoid leaving dangling multipart sessions.
      await javaR2MultipartAbort({ userId, uploadId: init.uploadId, key: init.key }).catch(() => {});
      throw e;
    }
  }

  console.log('java multipart contract e2e: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
