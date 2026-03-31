'use client';

type FetchWithTimeoutInit = RequestInit & {
  timeoutMs: number;
};

function createAbortError() {
  return new DOMException('Aborted', 'AbortError');
}

function createTimeoutError() {
  return new DOMException('request timed out', 'TimeoutError');
}

export function isAbortLikeError(error: unknown) {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError';
}

export async function fetchWithTimeout(input: RequestInfo | URL, init: FetchWithTimeoutInit) {
  const { timeoutMs, signal, ...rest } = init;
  const controller = new AbortController();
  let timeoutFired = false;

  const timeoutId = globalThis.setTimeout(() => {
    timeoutFired = true;
    controller.abort();
  }, Math.max(1, timeoutMs));

  const handleAbort = () => {
    controller.abort();
  };

  if (signal?.aborted) {
    controller.abort();
  } else if (signal) {
    signal.addEventListener('abort', handleAbort, { once: true });
  }

  try {
    return await fetch(input, {
      ...rest,
      signal: controller.signal,
    }).catch((error: unknown) => {
      if (signal?.aborted) throw createAbortError();
      if (timeoutFired) throw createTimeoutError();
      throw error;
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', handleAbort);
  }
}
