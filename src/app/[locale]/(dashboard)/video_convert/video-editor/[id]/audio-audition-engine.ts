export type AuditionAudioLike = {
  readyState: number;
  addEventListener: (event: string, listener: () => void, options?: { once?: boolean }) => void;
  removeEventListener: (event: string, listener: () => void) => void;
  load: () => void;
  play: () => Promise<void>;
  pause: () => void;
};

export type AudioReadyResult =
  | { status: 'ready'; latencyMs: number }
  | { status: 'timeout'; latencyMs: number }
  | { status: 'error'; latencyMs: number; code: string }
  | { status: 'aborted'; latencyMs: number };

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function elapsedMs(startMs: number) {
  return Math.max(0, Math.round(nowMs() - startMs));
}

export async function primeAuditionAudio(audio: AuditionAudioLike) {
  audio.load();
  const primePlay = audio.play().catch(() => {
    // Expected on browsers that require a user gesture. Priming still kicks off load.
  });
  audio.pause();
  await primePlay;
}

export function settleAuditionPreparation(
  task: Promise<unknown>,
  opts?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<AudioReadyResult> {
  const timeoutMs = opts?.timeoutMs ?? 4000;
  const signal = opts?.signal;
  const startMs = nowMs();

  if (signal?.aborted) {
    return Promise.resolve({ status: 'aborted', latencyMs: elapsedMs(startMs) });
  }

  return new Promise<AudioReadyResult>((resolve) => {
    let settled = false;

    const finish = (result: AudioReadyResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };

    const onAbort = () => {
      finish({ status: 'aborted', latencyMs: elapsedMs(startMs) });
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    task.then(() => {
      finish({ status: 'ready', latencyMs: elapsedMs(startMs) });
    }).catch((error: unknown) => {
      const code = error instanceof Error && error.message ? error.message : 'audition_prepare_failed';
      finish({ status: 'error', latencyMs: elapsedMs(startMs), code });
    });

    const timer = setTimeout(() => {
      finish({ status: 'timeout', latencyMs: elapsedMs(startMs) });
    }, timeoutMs);
  });
}

export function waitForAuditionReady(
  audio: AuditionAudioLike,
  opts?: { timeoutMs?: number; signal?: AbortSignal }
): Promise<AudioReadyResult> {
  const timeoutMs = opts?.timeoutMs ?? 4000;
  const signal = opts?.signal;
  const startMs = nowMs();

  if (signal?.aborted) {
    return Promise.resolve({ status: 'aborted', latencyMs: elapsedMs(startMs) });
  }
  if (audio.readyState >= 2) {
    return Promise.resolve({ status: 'ready', latencyMs: elapsedMs(startMs) });
  }

  return new Promise<AudioReadyResult>((resolve) => {
    let settled = false;

    const finish = (result: AudioReadyResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      audio.removeEventListener('loadeddata', onReady);
      audio.removeEventListener('canplay', onReady);
      audio.removeEventListener('error', onError);
      resolve(result);
    };

    const onReady = () => {
      finish({ status: 'ready', latencyMs: elapsedMs(startMs) });
    };
    const onError = () => {
      finish({ status: 'error', latencyMs: elapsedMs(startMs), code: 'audio_error' });
    };
    const onAbort = () => {
      finish({ status: 'aborted', latencyMs: elapsedMs(startMs) });
    };

    audio.addEventListener('loadeddata', onReady, { once: true });
    audio.addEventListener('canplay', onReady, { once: true });
    audio.addEventListener('error', onError, { once: true });
    signal?.addEventListener('abort', onAbort, { once: true });

    const timer = setTimeout(() => {
      finish({ status: 'timeout', latencyMs: elapsedMs(startMs) });
    }, timeoutMs);
  });
}
