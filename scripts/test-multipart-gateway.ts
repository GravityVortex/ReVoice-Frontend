import assert from 'node:assert/strict';

import {
  gatewayAbort,
  gatewayComplete,
  gatewayInitiate,
  gatewayListParts,
  gatewayPresignPart,
} from '../src/app/api/storage/multipart/gateway';
import { MULTIPART_KEY_V } from '../src/shared/lib/multipart-upload-contract';

const userId = 'user_xxx';
const fileId = 'file-123';
const key = `${userId}/${fileId}/${MULTIPART_KEY_V}`;

async function main() {
  // Initiate
  {
    const res = await gatewayInitiate(userId, {}, { initiate: async () => ({} as any) });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error, 'filename is required');
  }
  {
    const data = {
      uploadId: 'u1',
      fileId,
      bucket: 'b1',
      keyV: MULTIPART_KEY_V,
      key,
    };
    const res = await gatewayInitiate(
      userId,
      { filename: 'a.mp4', contentType: 'video/mp4' },
      { initiate: async () => data }
    );
    assert.deepEqual(res, { ok: true, data });
  }

  // Presign-part
  {
    const res = await gatewayPresignPart(userId, {}, { presignPart: async () => ({} as any) });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error, 'uploadId, key, and partNumber are required');
  }
  {
    const res = await gatewayPresignPart(
      userId,
      { uploadId: 'u1', key, partNumber: 0 },
      { presignPart: async () => ({} as any) }
    );
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error, 'invalid partNumber');
  }
  {
    const res = await gatewayPresignPart(
      userId,
      { uploadId: 'u1', key: `other/${fileId}/${MULTIPART_KEY_V}`, partNumber: 1 },
      { presignPart: async () => ({} as any) }
    );
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error, 'key must start with userId/');
  }
  {
    let gotExpires: number | undefined;
    const res = await gatewayPresignPart(
      userId,
      { uploadId: 'u1', key, partNumber: 1, expiresInSeconds: 1 },
      {
        presignPart: async (args) => {
          gotExpires = args.expiresInSeconds;
          return { partNumber: 1, url: 'https://example.com/part/1' };
        },
      }
    );
    assert.equal(gotExpires, 60);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.data, {
        partNumber: 1,
        presignedUrl: 'https://example.com/part/1',
      });
    }
  }

  // Complete
  {
    const res = await gatewayComplete(userId, {}, { complete: async () => ({} as any) });
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error, 'uploadId and key are required');
  }
  {
    const res = await gatewayComplete(
      userId,
      { uploadId: 'u1', key: `/${key}` },
      { complete: async () => ({} as any) }
    );
    assert.equal(res.ok, false);
    if (!res.ok) assert.equal(res.error, 'invalid key');
  }
  {
    // Parts present but missing etag -> should be omitted when calling Java.
    let javaParts: any = 'unset';
    const res = await gatewayComplete(
      userId,
      { uploadId: 'u1', key, parts: [{ partNumber: 1, etag: '' }] },
      {
        complete: async (args) => {
          javaParts = args.parts;
          return {
            success: true,
            bucket: 'b1',
            key,
            keyV: MULTIPART_KEY_V,
            fileId,
            downloadUrl: 'https://example.com/public',
          };
        },
      }
    );
    assert.equal(javaParts, undefined);
    assert.equal(res.ok, true);
    if (res.ok) assert.equal(res.data.publicUrl, 'https://example.com/public');
  }
  {
    // With ETags -> pass-through to Java.
    let javaParts: any = 'unset';
    const res = await gatewayComplete(
      userId,
      { uploadId: 'u1', key, parts: [{ partNumber: 1, etag: '"etag-1"' }] },
      {
        complete: async (args) => {
          javaParts = args.parts;
          return {
            success: true,
            bucket: 'b1',
            key: '', // exercise fallback
            keyV: '',
            fileId: '', // exercise fallback
            downloadUrl: 'https://example.com/public',
          };
        },
      }
    );
    assert.deepEqual(javaParts, [{ partNumber: 1, etag: 'etag-1' }]);
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.data.key, key);
      assert.equal(res.data.keyV, MULTIPART_KEY_V);
      assert.equal(res.data.fileId, fileId);
      assert.equal(res.data.publicUrl, 'https://example.com/public');
    }
  }

  // Abort
  {
    const res = await gatewayAbort(
      userId,
      { uploadId: 'u1', key },
      { abort: async () => ({ success: true }) }
    );
    assert.deepEqual(res, { ok: true, data: { success: true } });
  }

  // List-parts
  {
    const res = await gatewayListParts(
      userId,
      { uploadId: 'u1', key },
      {
        listParts: async () => ({
          parts: [
            { partNumber: 2, etag: '"e2"' },
            { partNumber: 1, etag: 'e1' },
            { partNumber: 0 as any, etag: 'bad' },
          ],
        }),
      }
    );
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.deepEqual(res.data.parts, [
        { partNumber: 1, etag: 'e1' },
        { partNumber: 2, etag: 'e2' },
      ]);
    }
  }

  console.log('multipart gateway: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
