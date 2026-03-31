import { describe, expect, it, vi } from 'vitest';

import { createSubtitleAudioEngine } from './subtitle-audio-engine';

describe('subtitle audio engine', () => {
  it('fully unwinds buffering when no playable video element is available', async () => {
    let bufferingController: AbortController | null = null;
    const setPlaybackBlockingState = vi.fn();
    const setIsSubtitleBuffering = vi.fn();
    const setIsPlaying = vi.fn();
    const pauseBgm = vi.fn();
    const stopWebAudioVoice = vi.fn();
    const stopAllSubtitleAudio = vi.fn();

    const engine = createSubtitleAudioEngine({
      locale: 'zh',
      getIsSubtitleBuffering: () => false,
      getSubtitleTrack: () => [
        {
          id: 'clip-1',
          startTime: 5,
          duration: 2,
        },
      ],
      getVideoElement: () => null,
      getVideoSyncMode: (fallback = 'timeline') => fallback,
      getVideoTransportTimeSec: () => 5,
      applyVideoTransportSnapshot: vi.fn(async () => true),
      ensureVoiceBuffer: vi.fn(async () => ({})),
      waitForVoiceRetryDelay: vi.fn(async () => undefined),
      isRecoverableVoiceLoadError: vi.fn(() => false),
      logEditorTransport: vi.fn(),
      handlePlaybackStartFailure: vi.fn(),
      pausePlaybackForBlockingState: vi.fn(),
      setPlaybackBlockingState,
      setIsSubtitleBuffering,
      setIsPlaying,
      setTransportStalled: vi.fn(),
      nextVideoPlayToken: vi.fn(() => 1),
      stopWebAudioVoice,
      stopAllSubtitleAudio,
      pauseBgm,
      getVoiceAudioContext: () => null,
      getAbortReason: () => new Error('aborted'),
      getBufferingAbortController: () => bufferingController,
      setBufferingAbortController: (controller) => {
        bufferingController = controller;
      },
      createNetworkFailedBlockingState: vi.fn(),
      dispatchTransport: vi.fn(),
    });

    await engine.beginSubtitleBuffering(0, 'https://example.com/clip-1.wav');

    expect(setPlaybackBlockingState).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        kind: 'loading',
        clipIndex: 0,
        subtitleId: 'clip-1',
      })
    );
    expect(setPlaybackBlockingState).toHaveBeenLastCalledWith(null);
    expect(setIsSubtitleBuffering).toHaveBeenNthCalledWith(1, true);
    expect(setIsSubtitleBuffering).toHaveBeenLastCalledWith(false);
    expect(pauseBgm).toHaveBeenCalledTimes(1);
    expect(stopWebAudioVoice).toHaveBeenCalledTimes(1);
    expect(stopAllSubtitleAudio).toHaveBeenCalledTimes(1);
    expect(setIsPlaying).toHaveBeenCalledWith(false);
    expect(bufferingController).toBeNull();
  });
});
