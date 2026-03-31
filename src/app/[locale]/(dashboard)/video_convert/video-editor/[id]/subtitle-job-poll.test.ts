import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pollSubtitleJob } from './subtitle-job-poll';

describe('pollSubtitleJob', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    global.fetch = originalFetch;
  });

  it('retries timed out status polls and resolves once the job returns ready data', async () => {
    let attempt = 0;

    global.fetch = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
      attempt += 1;

      if (attempt < 3) {
        return new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true }
          );
        });
      }

      return Promise.resolve({
        json: async () => ({
          code: 0,
          data: {
            path_name: 'draft/clip-1.wav',
          },
        }),
      } as Response);
    }) as typeof fetch;

    const request = pollSubtitleJob(
      {
        taskId: 'task-1',
        subtitleName: 'clip-1',
        type: 'translate_srt',
        jobId: 'job-1',
        failureMessage: 'generate failed',
      },
      {
        pollIntervalMs: 2_000,
        requestTimeoutMs: 1_000,
        maxNetworkFailures: 3,
      }
    );

    const expectation = expect(request).resolves.toEqual({
      path_name: 'draft/clip-1.wav',
    });

    await vi.advanceTimersByTimeAsync(8_000);

    await expectation;
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('throws after repeated timeout failures instead of hanging forever', async () => {
    global.fetch = vi.fn((_: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => {
            reject(new DOMException('Aborted', 'AbortError'));
          },
          { once: true }
        );
      });
    }) as typeof fetch;

    const request = pollSubtitleJob(
      {
        taskId: 'task-1',
        subtitleName: 'clip-1',
        type: 'translate_srt',
        jobId: 'job-1',
        failureMessage: 'generate failed',
      },
      {
        pollIntervalMs: 2_000,
        requestTimeoutMs: 1_000,
        maxNetworkFailures: 3,
      }
    );

    const expectation = expect(request).rejects.toThrow('generate failed');

    await vi.advanceTimersByTimeAsync(10_000);

    await expectation;
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
