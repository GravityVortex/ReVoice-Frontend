import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchWithTimeout } from './fetch-with-timeout';

describe('fetchWithTimeout', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it('resolves normally when the request finishes before the timeout', async () => {
    const response = { ok: true } as Response;

    global.fetch = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            reject(new DOMException('Aborted', 'AbortError'));
          },
          { once: true }
        );

        setTimeout(() => resolve(response), 20);
      });
    }) as typeof fetch;

    const request = fetchWithTimeout('/api/test', {
      method: 'POST',
      timeoutMs: 1000,
    });
    const expectation = expect(request).resolves.toBe(response);

    await vi.advanceTimersByTimeAsync(20);

    await expectation;
  });

  it('rejects with TimeoutError and aborts the inflight request when the request hangs', async () => {
    let aborted = false;

    global.fetch = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(new DOMException('Aborted', 'AbortError'));
          },
          { once: true }
        );
      });
    }) as typeof fetch;

    const request = fetchWithTimeout('/api/test', {
      method: 'POST',
      timeoutMs: 1000,
    });
    const expectation = expect(request).rejects.toMatchObject({
      name: 'TimeoutError',
      message: 'request timed out',
    });

    await vi.advanceTimersByTimeAsync(1000);

    await expectation;
    expect(aborted).toBe(true);
  });

  it('propagates caller aborts without rewriting them as timeouts', async () => {
    const callerController = new AbortController();
    let aborted = false;

    global.fetch = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            aborted = true;
            reject(new DOMException('Aborted', 'AbortError'));
          },
          { once: true }
        );
      });
    }) as typeof fetch;

    const request = fetchWithTimeout('/api/test', {
      method: 'POST',
      timeoutMs: 1000,
      signal: callerController.signal,
    });
    const expectation = expect(request).rejects.toMatchObject({
      name: 'AbortError',
    });

    callerController.abort();
    await vi.advanceTimersByTimeAsync(0);

    await expectation;
    expect(aborted).toBe(true);
  });
});
