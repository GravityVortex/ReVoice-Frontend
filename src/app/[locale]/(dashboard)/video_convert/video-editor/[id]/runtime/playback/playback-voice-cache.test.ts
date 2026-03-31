import { describe, expect, it } from 'vitest';

import {
  collectPrefetchSubtitleUrls,
  createPlaybackVoiceCache,
  resolveAdaptiveBufferPolicy,
  toWebAudioFetchUrl,
  type AdaptiveBufferPolicy,
} from './playback-voice-cache';

function createBuffer(durationFrames: number, channels = 1) {
  return {
    length: durationFrames,
    numberOfChannels: channels,
    duration: durationFrames / 48_000,
  } as AudioBuffer;
}

function createPolicy(overrides?: Partial<AdaptiveBufferPolicy>): AdaptiveBufferPolicy {
  return {
    startBufferSeconds: 2,
    playPrefetchCount: 6,
    pausePrefetchCount: 8,
    mediaLookaheadCount: 4,
    webAudioDecodeLookaheadCount: 3,
    voiceCacheMaxBytes: 28 * 1024 * 1024,
    ...overrides,
  };
}

describe('playback voice cache helpers', () => {
  it('proxies R2 voice urls through storage proxy but leaves other origins unchanged', () => {
    expect(toWebAudioFetchUrl('https://bucket.r2.cloudflarestorage.com/clip.wav')).toBe(
      '/api/storage/proxy?src=https%3A%2F%2Fbucket.r2.cloudflarestorage.com%2Fclip.wav'
    );
    expect(toWebAudioFetchUrl('https://public.example.com/clip.wav')).toBe('https://public.example.com/clip.wav');
    expect(toWebAudioFetchUrl('/local/file.wav')).toBe('/local/file.wav');
  });

  it('collects unique prefetch urls from the nearest subtitle anchor', () => {
    const track = [
      { id: 'a', startTime: 0, duration: 1, audioUrl: 'a.wav' },
      { id: 'b', startTime: 1, duration: 1, audioUrl: 'a.wav' },
      { id: 'c', startTime: 2, duration: 1, audioUrl: '' },
      { id: 'd', startTime: 3, duration: 1, audioUrl: 'd.wav' },
    ];

    expect(collectPrefetchSubtitleUrls(track, 1.4, 4)).toEqual(['a.wav', 'd.wav']);
  });

  it('derives tighter buffer policy for save-data or low-memory environments', () => {
    expect(
      resolveAdaptiveBufferPolicy({
        saveData: true,
        effectiveType: '4g',
        deviceMemory: 8,
        coarsePointer: false,
      })
    ).toEqual(
      createPolicy({
        startBufferSeconds: 5,
        playPrefetchCount: 3,
        pausePrefetchCount: 4,
        mediaLookaheadCount: 2,
        webAudioDecodeLookaheadCount: 1,
        voiceCacheMaxBytes: 14 * 1024 * 1024,
      })
    );
  });

  it('keeps voice buffers in LRU order and evicts the oldest entry when cache exceeds the byte limit', () => {
    const controller = createPlaybackVoiceCache({
      refs: {
        voiceAudioCtxRef: { current: null },
        voiceGainRef: { current: null },
        voiceCacheRef: { current: new Map() },
        voiceCacheBytesRef: { current: 0 },
        voiceInflightRef: { current: new Map() },
        voiceEpochRef: { current: 0 },
        voiceCurrentRef: { current: null },
        voiceNextRef: { current: null },
        bufferingAbortRef: { current: null },
        pausePrefetchAbortRef: { current: null },
        subtitleTrackRef: { current: [] },
        subtitleBackendRef: { current: 'webaudio' },
        isSubtitleMutedRef: { current: false },
        volumeRef: { current: 80 },
      },
      decodeQueue: {
        enqueue: async (task) => await task(new AbortController().signal),
      },
      abortReason: new Error('aborted'),
      isAbortError: () => false,
      getAdaptiveBufferPolicy: () =>
        createPolicy({
          voiceCacheMaxBytes: 16,
        }),
    });

    controller.cacheSetVoice('first.wav', createBuffer(2, 1));
    controller.cacheSetVoice('second.wav', createBuffer(2, 1));
    expect(controller.cacheGetVoice('first.wav')).not.toBeNull();

    controller.cacheSetVoice('third.wav', createBuffer(2, 1));

    expect(controller.cacheGetVoice('first.wav')).not.toBeNull();
    expect(controller.cacheGetVoice('second.wav')).toBeNull();
    expect(controller.cacheGetVoice('third.wav')).not.toBeNull();
  });
});
