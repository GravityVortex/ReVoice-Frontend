import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  settleAuditionPreparation,
  waitForAuditionReady,
  type AuditionAudioLike,
} from './audio-audition-engine';

class FakeAuditionAudio implements AuditionAudioLike {
  readyState = 0;

  private readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(event: string, listener: () => void) {
    const bucket = this.listeners.get(event) || new Set<() => void>();
    bucket.add(listener);
    this.listeners.set(event, bucket);
  }

  removeEventListener(event: string, listener: () => void) {
    this.listeners.get(event)?.delete(listener);
  }

  load() {
    // no-op for tests
  }

  async play() {
    return;
  }

  pause() {
    // no-op for tests
  }

  emit(event: string) {
    for (const listener of this.listeners.get(event) || []) {
      listener();
    }
  }
}

function createFakeAuditionAudio(opts?: {
  readyAfterMs?: number;
  errorAfterMs?: number;
}) {
  const audio = new FakeAuditionAudio();
  const readyAfterMs = opts?.readyAfterMs;
  const errorAfterMs = opts?.errorAfterMs;

  if (typeof readyAfterMs === 'number') {
    setTimeout(() => {
      audio.readyState = 2;
      audio.emit('loadeddata');
    }, readyAfterMs);
  }

  if (typeof errorAfterMs === 'number') {
    setTimeout(() => {
      audio.emit('error');
    }, errorAfterMs);
  }

  return audio;
}

describe('waitForAuditionReady', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns ready when audio becomes playable before timeout', async () => {
    vi.useFakeTimers();
    const audio = createFakeAuditionAudio({ readyAfterMs: 20 });
    const readyPromise = waitForAuditionReady(audio, { timeoutMs: 1000 });

    await vi.advanceTimersByTimeAsync(20);

    await expect(readyPromise).resolves.toEqual(
      expect.objectContaining({ status: 'ready' })
    );
  });

  it('returns timeout instead of error when audio is slow but not failed', async () => {
    vi.useFakeTimers();
    const audio = createFakeAuditionAudio({ readyAfterMs: 4500 });
    const readyPromise = waitForAuditionReady(audio, { timeoutMs: 1000 });

    await vi.advanceTimersByTimeAsync(1000);

    await expect(readyPromise).resolves.toEqual(
      expect.objectContaining({ status: 'timeout' })
    );
  });

  it('returns aborted when a newer audition cancels the current one', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const audio = createFakeAuditionAudio();
    const readyPromise = waitForAuditionReady(audio, {
      timeoutMs: 1000,
      signal: controller.signal,
    });

    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    await expect(readyPromise).resolves.toEqual(
      expect.objectContaining({ status: 'aborted' })
    );
  });

  it('returns error when audio emits an error event before timeout', async () => {
    vi.useFakeTimers();
    const audio = createFakeAuditionAudio({ errorAfterMs: 20 });
    const readyPromise = waitForAuditionReady(audio, { timeoutMs: 1000 });

    await vi.advanceTimersByTimeAsync(20);

    await expect(readyPromise).resolves.toEqual(
      expect.objectContaining({ status: 'error', code: 'audio_error' })
    );
  });
});

describe('settleAuditionPreparation', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns ready when preparation resolves before timeout', async () => {
    vi.useFakeTimers();
    const task = new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    const resultPromise = settleAuditionPreparation(task, { timeoutMs: 1000 });

    await vi.advanceTimersByTimeAsync(20);

    await expect(resultPromise).resolves.toEqual(
      expect.objectContaining({ status: 'ready' })
    );
  });

  it('returns timeout when preparation hangs too long', async () => {
    vi.useFakeTimers();
    const task = new Promise<void>(() => {});
    const resultPromise = settleAuditionPreparation(task, { timeoutMs: 1000 });

    await vi.advanceTimersByTimeAsync(1000);

    await expect(resultPromise).resolves.toEqual(
      expect.objectContaining({ status: 'timeout' })
    );
  });

  it('returns aborted when preparation is cancelled mid-flight', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const task = new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
    const resultPromise = settleAuditionPreparation(task, {
      timeoutMs: 1000,
      signal: controller.signal,
    });

    controller.abort();
    await vi.advanceTimersByTimeAsync(0);

    await expect(resultPromise).resolves.toEqual(
      expect.objectContaining({ status: 'aborted' })
    );
  });
});
