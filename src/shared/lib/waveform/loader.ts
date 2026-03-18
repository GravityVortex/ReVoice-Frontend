export type LimitedTask<T> = (signal: AbortSignal) => Promise<T>;

function abortError() {
  if (typeof DOMException !== 'undefined') return new DOMException('Aborted', 'AbortError');
  const e = new Error('Aborted');
  e.name = 'AbortError';
  return e;
}

type Entry<T> = {
  id: number;
  task: LimitedTask<T>;
  signal: AbortSignal;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  onAbort: () => void;
};

/**
 * Tiny concurrency-limited task queue with AbortSignal support.
 * - KISS: no retries, no priorities, no fancy scheduling.
 * - If a queued task is aborted before start, we remove it from the queue.
 */
export function createLimitedTaskQueue(concurrency: number) {
  let active = 0;
  let seq = 0;
  const queue: Entry<unknown>[] = [];

  const pump = () => {
    while (active < concurrency && queue.length > 0) {
      const entry = queue.shift()!;

      // If aborted while waiting in the queue, reject and continue.
      if (entry.signal.aborted) {
        entry.signal.removeEventListener('abort', entry.onAbort);
        entry.reject(abortError());
        continue;
      }

      entry.signal.removeEventListener('abort', entry.onAbort);
      active += 1;

      void entry
        .task(entry.signal)
        .then(entry.resolve, entry.reject)
        .finally(() => {
          active -= 1;
          pump();
        });
    }
  };

  return {
    enqueue<T>(task: LimitedTask<T>, signal: AbortSignal): Promise<T> {
      if (signal.aborted) return Promise.reject(abortError());

      const id = (seq += 1);
      return new Promise<T>((resolve, reject) => {
        const entry: Entry<T> = {
          id,
          task,
          signal,
          resolve,
          reject,
          onAbort: () => {
            // If still queued, remove and reject immediately.
            const idx = queue.findIndex((x) => x.id === id);
            if (idx >= 0) queue.splice(idx, 1);
            reject(abortError());
          },
        };
        signal.addEventListener('abort', entry.onAbort, { once: true });
        queue.push(entry as unknown as Entry<unknown>);
        pump();
      });
    },
    getActiveCount() {
      return active;
    },
    getPendingCount() {
      return queue.length;
    },
  };
}

// Keep these conservative. They must never block editing.
export const waveformLoadQueue = createLimitedTaskQueue(3);
export const audioMetaLoadQueue = createLimitedTaskQueue(4);

