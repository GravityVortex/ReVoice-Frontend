import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

// Ensure .env is loaded for scripts
import '../src/config';

import { getUuid } from '../src/shared/lib/hash';
import { getPreSignedUrl } from '../src/shared/services/javaService';

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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const filePath = args.file;
  const userId = args.userId || args.userid;
  const contentType = args.contentType || 'video/mp4';

  if (!filePath) throw new Error('missing --file <path>');
  if (!userId) throw new Error('missing --userId <userId>');

  const absPath = path.resolve(filePath);
  const st = await fs.stat(absPath);
  assert.ok(st.isFile(), 'file is not a regular file');

  const filename = path.basename(absPath);
  const fileId = getUuid();
  const keyV = 'original/video/video_original.mp4';
  const key = `${userId}/${fileId}/${keyV}`;

  console.log(`Single PUT upload via Java presigned-urls -> R2`);
  console.log(`file=${filename} (${(st.size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`key=${key}`);

  const [upload] = await getPreSignedUrl([
    { path: key, operation: 'upload', expirationMinutes: 60 },
  ]);
  assert.ok(upload?.url, 'missing upload url');

  const buf = await fs.readFile(absPath);
  const putRes = await fetch(upload.url, { method: 'PUT', body: buf, headers: { 'Content-Type': contentType } });
  if (!putRes.ok) {
    throw new Error(`PUT failed: ${putRes.status} ${putRes.statusText} ${await putRes.text().catch(() => '')}`);
  }
  console.log(`PUT ok: ${putRes.status}`);

  const [download] = await getPreSignedUrl([
    { path: key, operation: 'download', expirationMinutes: 240 },
  ]);
  assert.ok(download?.url, 'missing download url');
  console.log(`downloadUrl=${download.url}`);

  const verifyRes = await fetch(download.url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
  if (!(verifyRes.status === 206 || verifyRes.status === 200)) {
    console.warn(`verify GET returned ${verifyRes.status} ${verifyRes.statusText}`);
  } else {
    console.log('verify ok');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

