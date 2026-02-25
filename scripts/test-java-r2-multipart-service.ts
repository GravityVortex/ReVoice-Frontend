import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';

type ReqBody = Record<string, any>;

async function readText(req: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
  await once(req, 'end');
  return Buffer.concat(chunks).toString('utf8');
}

function json(res: http.ServerResponse, status: number, body: any) {
  const data = Buffer.from(JSON.stringify(body));
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', String(data.length));
  res.end(data);
}

async function main() {
  const userId = 'user_xxx';
  const fileId = 'file-123';
  const keyV = 'original/video/video_original.mp4';
  const key = `${userId}/${fileId}/${keyV}`;

  let EncryptionUtil: any;

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'POST') {
        return json(res, 405, { code: 405, message: 'Method Not Allowed', data: null });
      }
      if (!req.url) {
        return json(res, 404, { code: 404, message: 'Not Found', data: null });
      }
      if (!EncryptionUtil) {
        return json(res, 500, { code: 500, message: 'EncryptionUtil not ready', data: null });
      }

      const ct = String(req.headers['content-type'] || '');
      assert.equal(ct, 'text/plain');

      const enc = await readText(req);
      assert.ok(enc.length > 40, 'encrypted payload too short');

      const payload = EncryptionUtil.decryptRequest(enc) as ReqBody;
      assert.ok(typeof payload.time === 'number' || typeof payload.time === 'string');

      // Basic route simulation per docs v1.3.
      if (req.url === '/api/nextjs/r2/multipart/initiate') {
        assert.equal(payload.userId, userId);
        assert.equal(payload.filename, 'a.mp4');
        assert.equal(payload.contentType, 'video/mp4');
        return json(res, 200, {
          code: 200,
          message: 'Success',
          data: { uploadId: 'upload-1', fileId, bucket: 'bucket-1', keyV, key },
        });
      }

      if (req.url === '/api/nextjs/r2/multipart/presign-part') {
        assert.equal(payload.userId, userId);
        assert.equal(payload.uploadId, 'upload-1');
        assert.equal(payload.key, key);
        assert.equal(payload.partNumber, 1);
        // expiresInSeconds is optional.
        return json(res, 200, {
          code: 200,
          message: 'Success',
          data: { partNumber: 1, url: 'https://example.com/presigned-part-1' },
        });
      }

      if (req.url === '/api/nextjs/r2/multipart/list-parts') {
        assert.equal(payload.userId, userId);
        assert.equal(payload.uploadId, 'upload-1');
        assert.equal(payload.key, key);
        return json(res, 200, {
          code: 200,
          message: 'Success',
          data: { parts: [{ partNumber: 1, etag: '"etag-1"' }] },
        });
      }

      if (req.url === '/api/nextjs/r2/multipart/complete') {
        assert.equal(payload.userId, userId);
        assert.equal(payload.key, key);

        if (payload.uploadId === 'no-parts') {
          return json(res, 400, {
            code: 400,
            message: 'No parts uploaded for this uploadId',
            data: null,
          });
        }

        assert.equal(payload.uploadId, 'upload-1');
        return json(res, 200, {
          code: 200,
          message: 'Success',
          data: {
            success: true,
            bucket: 'bucket-1',
            key,
            keyV,
            fileId,
            downloadUrl: 'https://example.com/download',
          },
        });
      }

      if (req.url === '/api/nextjs/r2/multipart/abort') {
        assert.equal(payload.userId, userId);
        assert.equal(payload.uploadId, 'upload-1');
        assert.equal(payload.key, key);
        return json(res, 200, { code: 200, message: 'Success', data: { success: true } });
      }

      return json(res, 404, { code: 404, message: 'Not Found', data: null });
    } catch (e: any) {
      return json(res, 500, { code: 500, message: e?.message || 'Internal error', data: null });
    }
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as AddressInfo).port;

  // Must be set before importing any project modules that read system-config constants.
  process.env.JAVA_SERVER_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'test_secret_zhesheng_!@#$%Bsjaldffads';

  // Silence noisy logs during tests.
  const origLog = console.log;
  console.log = () => {};
  try {
    const utilMod = await import('../src/shared/lib/EncryptionUtil');
    EncryptionUtil = utilMod.default;
    const svc = await import('../src/shared/services/javaR2Multipart');

    const init = await svc.javaR2MultipartInitiate({
      userId,
      filename: 'a.mp4',
      contentType: 'video/mp4',
    });
    assert.deepEqual(init, { uploadId: 'upload-1', fileId, bucket: 'bucket-1', keyV, key });

    const pre = await svc.javaR2MultipartPresignPart({
      userId,
      uploadId: init.uploadId,
      key: init.key,
      partNumber: 1,
      expiresInSeconds: 3600,
    });
    assert.deepEqual(pre, { partNumber: 1, url: 'https://example.com/presigned-part-1' });

    const lp = await svc.javaR2MultipartListParts({
      userId,
      uploadId: init.uploadId,
      key: init.key,
    });
    assert.deepEqual(lp, { parts: [{ partNumber: 1, etag: '"etag-1"' }] });

    const comp = await svc.javaR2MultipartComplete({
      userId,
      uploadId: init.uploadId,
      key: init.key,
    });
    assert.equal(comp.success, true);
    assert.equal(comp.downloadUrl, 'https://example.com/download');

    const ab = await svc.javaR2MultipartAbort({
      userId,
      uploadId: init.uploadId,
      key: init.key,
    });
    assert.deepEqual(ab, { success: true });

    // Error path: HTTP 400 + code 400 should throw.
    await assert.rejects(
      () =>
        svc.javaR2MultipartComplete({
          userId,
          uploadId: 'no-parts',
          key: init.key,
        }),
      /No parts uploaded/
    );
  } finally {
    console.log = origLog;
    server.close();
  }

  console.log('java r2 multipart service: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
