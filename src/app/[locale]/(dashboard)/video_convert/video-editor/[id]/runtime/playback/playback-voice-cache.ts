type SubtitleTrackItemLike = {
  startTime: number;
  audioUrl?: string;
};

type MutableRefObjectLike<T> = {
  current: T;
};

type AudioSourceState = {
  index: number;
  url: string;
  source: AudioBufferSourceNode;
  stopAt: number;
  epoch: number;
};

export type VoiceCacheEntry = {
  buffer: AudioBuffer;
  bytes: number;
};

export type VoiceInflightEntry = {
  controller: AbortController;
  promise: Promise<AudioBuffer>;
};

export type AdaptiveBufferPolicy = {
  startBufferSeconds: number;
  playPrefetchCount: number;
  pausePrefetchCount: number;
  mediaLookaheadCount: number;
  webAudioDecodeLookaheadCount: number;
  voiceCacheMaxBytes: number;
};

type AdaptiveBufferEnvironment = {
  saveData?: boolean;
  effectiveType?: string;
  deviceMemory?: number | null;
  coarsePointer?: boolean;
};

type DecodeQueueLike = {
  enqueue<T>(task: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T>;
};

type CreatePlaybackVoiceCacheArgs = {
  refs: {
    voiceAudioCtxRef: MutableRefObjectLike<AudioContext | null>;
    voiceGainRef: MutableRefObjectLike<GainNode | null>;
    voiceCacheRef: MutableRefObjectLike<Map<string, VoiceCacheEntry>>;
    voiceCacheBytesRef: MutableRefObjectLike<number>;
    voiceInflightRef: MutableRefObjectLike<Map<string, VoiceInflightEntry>>;
    voiceEpochRef: MutableRefObjectLike<number>;
    voiceCurrentRef: MutableRefObjectLike<AudioSourceState | null>;
    voiceNextRef: MutableRefObjectLike<AudioSourceState | null>;
    bufferingAbortRef: MutableRefObjectLike<AbortController | null>;
    pausePrefetchAbortRef: MutableRefObjectLike<AbortController | null>;
    subtitleTrackRef: MutableRefObjectLike<SubtitleTrackItemLike[]>;
    subtitleBackendRef: MutableRefObjectLike<'webaudio' | 'media'>;
    isSubtitleMutedRef: MutableRefObjectLike<boolean>;
    volumeRef: MutableRefObjectLike<number>;
  };
  decodeQueue: DecodeQueueLike;
  abortReason: unknown;
  isAbortError: (error: unknown) => boolean;
  getAdaptiveBufferPolicy?: () => AdaptiveBufferPolicy;
  fetchImpl?: typeof fetch;
};

const VOICE_FETCH_ATTEMPT_TIMEOUT_MS = 2_000;

function stopPlaybackSource(item: AudioSourceState | null) {
  if (!item) return;
  try {
    item.source.onended = null;
  } catch {
    // ignore
  }
  try {
    item.source.stop(0);
  } catch {
    // ignore
  }
  try {
    item.source.disconnect();
  } catch {
    // ignore
  }
}

function createVoiceLoadError(code: 'VOICE_FETCH_TIMEOUT' | 'VOICE_FETCH_FAILED', message: string, cause?: unknown) {
  const error = new Error(message) as Error & { code: string; cause?: unknown };
  error.name = code === 'VOICE_FETCH_TIMEOUT' ? 'TimeoutError' : 'VoiceFetchError';
  error.code = code;
  if (cause !== undefined) error.cause = cause;
  return error;
}

function readAdaptiveBufferEnvironment(): AdaptiveBufferEnvironment {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {};
  }

  const connection = (navigator as Navigator & {
    connection?: {
      saveData?: boolean;
      effectiveType?: string;
    };
    deviceMemory?: number;
  }).connection;
  const deviceMemoryRaw = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory);

  return {
    saveData: Boolean(connection?.saveData),
    effectiveType: String(connection?.effectiveType || '').toLowerCase(),
    deviceMemory: Number.isFinite(deviceMemoryRaw) && deviceMemoryRaw > 0 ? deviceMemoryRaw : null,
    coarsePointer: typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
  };
}

export function resolveAdaptiveBufferPolicy(env: AdaptiveBufferEnvironment = {}): AdaptiveBufferPolicy {
  const defaults: AdaptiveBufferPolicy = {
    startBufferSeconds: 2,
    playPrefetchCount: 6,
    pausePrefetchCount: 8,
    mediaLookaheadCount: 4,
    webAudioDecodeLookaheadCount: 3,
    voiceCacheMaxBytes: 28 * 1024 * 1024,
  };

  const saveData = Boolean(env.saveData);
  const effectiveType = String(env.effectiveType || '').toLowerCase();
  const deviceMemory = Number.isFinite(env.deviceMemory) && Number(env.deviceMemory) > 0 ? Number(env.deviceMemory) : null;
  const coarsePointer = Boolean(env.coarsePointer);

  const verySlowNetwork = effectiveType === 'slow-2g' || effectiveType === '2g';
  const slowNetwork = effectiveType === '3g';
  const lowMemory = deviceMemory != null && deviceMemory <= 2;
  const midMemory = deviceMemory != null && deviceMemory <= 4;

  if (saveData || verySlowNetwork || lowMemory) {
    return {
      startBufferSeconds: 5,
      playPrefetchCount: 3,
      pausePrefetchCount: 4,
      mediaLookaheadCount: 2,
      webAudioDecodeLookaheadCount: 1,
      voiceCacheMaxBytes: 14 * 1024 * 1024,
    };
  }

  if (slowNetwork || midMemory || coarsePointer) {
    return {
      startBufferSeconds: 4,
      playPrefetchCount: 4,
      pausePrefetchCount: 6,
      mediaLookaheadCount: 3,
      webAudioDecodeLookaheadCount: 2,
      voiceCacheMaxBytes: 20 * 1024 * 1024,
    };
  }

  return defaults;
}

export function estimateAudioBufferBytes(buffer: AudioBuffer) {
  return buffer.length * buffer.numberOfChannels * 4;
}

export function toWebAudioFetchUrl(raw: string) {
  const source = raw.trim();
  if (!source) return '';
  if (!/^https?:\/\//i.test(source)) return source;

  try {
    const url = new URL(source);
    const isR2Host = url.hostname.endsWith('.r2.cloudflarestorage.com') || url.hostname.endsWith('.r2.dev');
    return isR2Host ? `/api/storage/proxy?src=${encodeURIComponent(source)}` : source;
  } catch {
    return source;
  }
}

export function findSubtitleStartIndexForPrefetch(track: SubtitleTrackItemLike[], time: number) {
  if (!track.length) return 0;
  let lo = 0;
  let hi = track.length - 1;
  let best = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (track[mid].startTime <= time) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return Math.max(0, best);
}

export function collectPrefetchSubtitleUrls(track: SubtitleTrackItemLike[], time: number, count = 6) {
  if (!track.length) return [] as string[];

  const anchor = Number.isFinite(time) ? Math.max(0, time) : 0;
  const startIndex = findSubtitleStartIndexForPrefetch(track, anchor);
  const maxCount = Math.max(1, count);
  const out: string[] = [];
  const seen = new Set<string>();

  for (let offset = 0; offset < maxCount; offset += 1) {
    const segment = track[startIndex + offset];
    const url = (segment?.audioUrl || '').trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }

  return out;
}

export function createPlaybackVoiceCache(args: CreatePlaybackVoiceCacheArgs) {
  const refs = args.refs;

  const getAdaptiveBufferPolicy = () => args.getAdaptiveBufferPolicy?.() ?? resolveAdaptiveBufferPolicy(readAdaptiveBufferEnvironment());

  const stopWebAudioVoice = () => {
    refs.voiceEpochRef.current += 1;
    const current = refs.voiceCurrentRef.current;
    const next = refs.voiceNextRef.current;
    refs.voiceCurrentRef.current = null;
    refs.voiceNextRef.current = null;

    stopPlaybackSource(current);
    stopPlaybackSource(next);
  };

  const stopWebAudioVoiceCurrent = () => {
    const current = refs.voiceCurrentRef.current;
    refs.voiceCurrentRef.current = null;
    if (!current) return;
    refs.voiceEpochRef.current += 1;
    stopPlaybackSource(current);
  };

  const abortAllVoiceInflight = () => {
    try {
      refs.bufferingAbortRef.current?.abort(args.abortReason);
    } catch {
      // ignore
    }
    refs.bufferingAbortRef.current = null;

    try {
      refs.pausePrefetchAbortRef.current?.abort(args.abortReason);
    } catch {
      // ignore
    }
    refs.pausePrefetchAbortRef.current = null;

    const entries = Array.from(refs.voiceInflightRef.current.values());
    refs.voiceInflightRef.current.clear();
    for (const entry of entries) {
      try {
        entry.controller.abort(args.abortReason);
      } catch {
        // ignore
      }
    }
  };

  const clearVoiceCache = () => {
    refs.voiceCacheRef.current.clear();
    refs.voiceCacheBytesRef.current = 0;
  };

  const getOrCreateVoiceAudioCtx = () => {
    const AudioContextCtor = (globalThis as typeof globalThis & {
      AudioContext?: new (options?: { latencyHint?: string }) => AudioContext;
      webkitAudioContext?: new (options?: { latencyHint?: string }) => AudioContext;
    }).AudioContext;
    const WebkitAudioContextCtor = (globalThis as typeof globalThis & {
      webkitAudioContext?: new (options?: { latencyHint?: string }) => AudioContext;
    }).webkitAudioContext;
    const AudioContextClass = AudioContextCtor || WebkitAudioContextCtor;

    if (!AudioContextClass) throw new Error('WebAudio not supported');
    if (refs.voiceAudioCtxRef.current) return refs.voiceAudioCtxRef.current;

    const ctx = new AudioContextClass({ latencyHint: 'interactive' });
    refs.voiceAudioCtxRef.current = ctx;

    const gain = ctx.createGain();
    gain.gain.value = refs.isSubtitleMutedRef.current ? 0 : refs.volumeRef.current / 100;
    gain.connect(ctx.destination);
    refs.voiceGainRef.current = gain;

    return ctx;
  };

  const cacheGetVoice = (key: string) => {
    const cache = refs.voiceCacheRef.current;
    const hit = cache.get(key);
    if (!hit) return null;
    cache.delete(key);
    cache.set(key, hit);
    return hit.buffer;
  };

  const cacheSetVoice = (key: string, buffer: AudioBuffer) => {
    const cache = refs.voiceCacheRef.current;
    const bytes = estimateAudioBufferBytes(buffer);

    const previous = cache.get(key);
    if (previous) {
      refs.voiceCacheBytesRef.current -= previous.bytes;
      cache.delete(key);
    }

    cache.set(key, { buffer, bytes });
    refs.voiceCacheBytesRef.current += bytes;

    const maxBytes = getAdaptiveBufferPolicy().voiceCacheMaxBytes;
    while (refs.voiceCacheBytesRef.current > maxBytes && cache.size > 1) {
      const oldestKey = cache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      const oldest = cache.get(oldestKey);
      cache.delete(oldestKey);
      if (oldest) refs.voiceCacheBytesRef.current -= oldest.bytes;
    }
  };

  const fetchAudioArrayBuffer = async (raw: string, signal: AbortSignal) => {
    const abortError = () => {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      return error;
    };
    const fetchImpl = args.fetchImpl ?? fetch;

    const directFetch = async (url: string) => {
      if (signal.aborted) throw abortError();

      const controller = new AbortController();
      let timeoutFired = false;
      const timeoutId = window.setTimeout(() => {
        timeoutFired = true;
        controller.abort();
      }, VOICE_FETCH_ATTEMPT_TIMEOUT_MS);
      const onAbort = () => controller.abort();
      signal.addEventListener('abort', onAbort, { once: true });

      try {
        const response = await fetchImpl(url, { signal: controller.signal }).catch((error: unknown) => {
          if (signal.aborted) throw abortError();
          if (timeoutFired) throw createVoiceLoadError('VOICE_FETCH_TIMEOUT', 'voice fetch timed out', error);
          throw createVoiceLoadError('VOICE_FETCH_FAILED', 'voice fetch failed', error);
        });

        if (!response.ok) {
          throw createVoiceLoadError('VOICE_FETCH_FAILED', `fetch failed: ${response.status}`);
        }

        return await response.arrayBuffer();
      } finally {
        window.clearTimeout(timeoutId);
        signal.removeEventListener('abort', onAbort);
      }
    };

    try {
      return await directFetch(raw);
    } catch (error) {
      if (signal.aborted) throw abortError();
      const proxyUrl = toWebAudioFetchUrl(raw);
      if (proxyUrl && proxyUrl !== raw) return await directFetch(proxyUrl);
      throw error;
    }
  };

  const decodeVoiceBuffer = async (url: string, signal: AbortSignal) => {
    const ctx = getOrCreateVoiceAudioCtx();
    const arrayBuffer = await fetchAudioArrayBuffer(url, signal);
    if (signal.aborted) {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      throw error;
    }

    const input = arrayBuffer.slice(0);
    const maybePromise = (ctx as AudioContext & { decodeAudioData?: (buffer: ArrayBuffer) => Promise<AudioBuffer> }).decodeAudioData(input);
    if (maybePromise && typeof maybePromise.then === 'function') {
      return (await maybePromise) as AudioBuffer;
    }

    return await new Promise<AudioBuffer>((resolve, reject) => {
      try {
        ctx.decodeAudioData(input, resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
  };

  const ensureVoiceBuffer = async (url: string, signal: AbortSignal) => {
    const key = url.trim();
    if (!key) throw new Error('missing url');

    const cached = cacheGetVoice(key);
    if (cached) return cached;

    const inflight = refs.voiceInflightRef.current.get(key);
    if (inflight) return await inflight.promise;

    const controller = new AbortController();
    const onAbort = () => {
      try {
        controller.abort(args.abortReason);
      } catch {
        // ignore
      }
    };

    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    const promise = args.decodeQueue
      .enqueue((queueSignal) => decodeVoiceBuffer(key, queueSignal), controller.signal)
      .then((buffer) => {
        if (signal.aborted) throw args.abortReason;
        cacheSetVoice(key, buffer);
        return buffer;
      })
      .catch((error) => {
        if (signal.aborted || args.isAbortError(error)) throw args.abortReason;
        throw error;
      })
      .finally(() => {
        refs.voiceInflightRef.current.delete(key);
        try {
          signal.removeEventListener('abort', onAbort);
        } catch {
          // ignore
        }
      });

    refs.voiceInflightRef.current.set(key, { controller, promise });
    return await promise;
  };

  const getPrefetchSubtitleUrls = (time: number, count = 6) =>
    collectPrefetchSubtitleUrls(refs.subtitleTrackRef.current, time, count);

  const getAdaptivePrefetchCount = (mode: 'play' | 'pause' | 'lookahead') => {
    const policy = getAdaptiveBufferPolicy();
    if (mode === 'play') return policy.playPrefetchCount;
    if (mode === 'pause') return policy.pausePrefetchCount;
    return policy.mediaLookaheadCount;
  };

  const getAdaptiveWebAudioDecodeLookaheadCount = () => getAdaptiveBufferPolicy().webAudioDecodeLookaheadCount;

  const prefetchVoiceAroundTime = (time: number, opts?: { count?: number; signal?: AbortSignal }) => {
    if (refs.subtitleBackendRef.current !== 'webaudio') return;

    const urls = getPrefetchSubtitleUrls(time, opts?.count ?? 6);
    if (urls.length <= 0) return;
    const parentSignal = opts?.signal;

    for (let index = 0; index < urls.length; index += 1) {
      if (parentSignal?.aborted) return;
      const url = urls[index];
      if (!url) continue;
      if (cacheGetVoice(url) || refs.voiceInflightRef.current.has(url)) continue;

      const controller = new AbortController();
      let offAbort: (() => void) | null = null;

      if (parentSignal) {
        const onAbort = () => {
          try {
            controller.abort(args.abortReason);
          } catch {
            // ignore
          }
        };
        parentSignal.addEventListener('abort', onAbort, { once: true });
        offAbort = () => parentSignal.removeEventListener('abort', onAbort);
      }

      void ensureVoiceBuffer(url, controller.signal)
        .catch(() => {
          // silent
        })
        .finally(() => {
          offAbort?.();
        });
    }
  };

  return {
    stopWebAudioVoice,
    stopWebAudioVoiceCurrent,
    abortAllVoiceInflight,
    clearVoiceCache,
    getOrCreateVoiceAudioCtx,
    getAdaptiveBufferPolicy,
    cacheGetVoice,
    cacheSetVoice,
    ensureVoiceBuffer,
    getPrefetchSubtitleUrls,
    getAdaptivePrefetchCount,
    getAdaptiveWebAudioDecodeLookaheadCount,
    prefetchVoiceAroundTime,
  };
}
