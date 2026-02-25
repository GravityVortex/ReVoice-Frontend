import assert from 'node:assert/strict';

import { MultipartUploader } from '../src/shared/lib/multipart-upload';
import { MULTIPART_KEY_V } from '../src/shared/lib/multipart-upload-contract';

class FakeUpload {
  private listeners: Array<(e: any) => void> = [];

  addEventListener(name: string, cb: (e: any) => void) {
    if (name === 'progress') this.listeners.push(cb);
  }

  dispatchProgress(loaded: number) {
    const evt = { lengthComputable: true, loaded, total: loaded };
    for (const cb of this.listeners) cb(evt);
  }
}

class FakeXMLHttpRequest {
  timeout = 0;
  status = 0;
  upload = new FakeUpload();

  onload: null | (() => void) = null;
  onerror: null | (() => void) = null;
  ontimeout: null | (() => void) = null;

  private url = '';
  private headers = new Map<string, string>();

  open(method: string, url: string) {
    assert.equal(method, 'PUT');
    this.url = url;
  }

  getResponseHeader(name: string) {
    return this.headers.get(name.toLowerCase()) ?? null;
  }

  abort() {
    // no-op for tests
  }

  send(body: any) {
    const size = Number(body?.size) || 0;
    this.upload.dispatchProgress(size);

    const m = this.url.match(/part\/(\d+)/);
    const partNumber = m ? Number.parseInt(m[1]!, 10) : 0;
    this.headers.set('etag', `"etag-${partNumber}"`);

    // Important: uploader must treat any 2xx as success (not only 200).
    this.status = 204;

    queueMicrotask(() => {
      this.onload?.();
    });
  }
}

async function main() {
  const originalFetch = globalThis.fetch;
  const originalXHR = (globalThis as any).XMLHttpRequest;

  const calls: Array<{ url: string; body?: any }> = [];

  try {
    (globalThis as any).XMLHttpRequest = FakeXMLHttpRequest;

    globalThis.fetch = async (input: any, init?: any) => {
      const url = String(input);
      let body: any;
      if (init?.body) {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      calls.push({ url, body });

      if (url === '/api/storage/multipart/initiate') {
        if (body?.filename === 'fail.mp4') {
          return new Response(
            JSON.stringify({ code: -1, message: 'initiate failed', data: null }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return new Response(
          JSON.stringify({
            code: 0,
            message: 'ok',
            data: {
              uploadId: 'upload-1',
              key: `user_xxx/file-123/${MULTIPART_KEY_V}`,
              keyV: MULTIPART_KEY_V,
              fileId: 'file-123',
              bucket: 'bucket-1',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url === '/api/storage/multipart/presign-part') {
        const partNumber = Number(body?.partNumber);
        return new Response(
          JSON.stringify({
            code: 0,
            message: 'ok',
            data: { partNumber, presignedUrl: `https://example.com/part/${partNumber}` },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url === '/api/storage/multipart/complete') {
        assert.equal(body?.uploadId, 'upload-1');
        assert.equal(body?.key, `user_xxx/file-123/${MULTIPART_KEY_V}`);
        assert.ok(Array.isArray(body?.parts));
        assert.equal(body.parts.length, 3);
        assert.deepEqual(
          body.parts.map((p: any) => p.partNumber),
          [1, 2, 3]
        );

        return new Response(
          JSON.stringify({
            code: 0,
            message: 'ok',
            data: {
              success: true,
              bucket: 'bucket-1',
              key: `user_xxx/file-123/${MULTIPART_KEY_V}`,
              publicUrl: 'https://example.com/public',
              keyV: MULTIPART_KEY_V,
              fileId: 'file-123',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }

      if (url === '/api/storage/multipart/abort') {
        return new Response(JSON.stringify({ code: 0, message: 'ok', data: { success: true } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ code: -1, message: `unexpected url: ${url}`, data: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    // Happy path: 13MB file with 6MB chunks => 3 parts (6MB + 6MB + 1MB).
    const fileSize = 13 * 1024 * 1024;
    const file = new File([Buffer.alloc(fileSize)], 'a.mp4', { type: 'video/mp4' });

    const uploader = new MultipartUploader();
    const progressMarks: number[] = [];

    const result = await uploader.upload(file, {
      chunkSize: 6 * 1024 * 1024,
      concurrency: 2,
      maxRetries: 0,
      onProgress: (p) => progressMarks.push(p),
    });

    assert.equal(result.success, true);
    assert.equal(result.publicUrl, 'https://example.com/public');
    assert.equal(result.keyV, MULTIPART_KEY_V);
    assert.equal(result.fileId, 'file-123');
    assert.equal(result.bucket, 'bucket-1');
    assert.equal(progressMarks.at(-1), 100);

    const initiateCalls = calls.filter((c) => c.url === '/api/storage/multipart/initiate');
    const presignCalls = calls.filter((c) => c.url === '/api/storage/multipart/presign-part');
    const completeCalls = calls.filter((c) => c.url === '/api/storage/multipart/complete');
    assert.equal(initiateCalls.length, 1);
    assert.equal(presignCalls.length, 3);
    assert.equal(completeCalls.length, 1);

    // Error path: wrapper code -1 must throw.
    const badFile = new File([Buffer.alloc(1)], 'fail.mp4', { type: 'video/mp4' });
    await assert.rejects(() => new MultipartUploader().upload(badFile, { chunkSize: 1, concurrency: 1, maxRetries: 0 }), /initiate failed/);
  } finally {
    globalThis.fetch = originalFetch;
    (globalThis as any).XMLHttpRequest = originalXHR;
  }

  console.log('multipart uploader: ok');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
