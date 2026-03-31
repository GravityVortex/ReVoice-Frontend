import { describe, expect, it, vi, beforeEach } from 'vitest';

const { toastError } = vi.hoisted(() => ({
  toastError: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastError,
    info: vi.fn(),
  },
}));

import { createPlaybackAuditionFlow } from './playback-audition-flow';

describe('playback audition flow', () => {
  beforeEach(() => {
    toastError.mockReset();
  });

  it('refuses source audition before convert context is ready so transport does not enter zombie buffering', async () => {
    let auditionController: AbortController | null = null;
    let auditionToken = 0;
    const dispatchTransport = vi.fn();
    const handleSeek = vi.fn();
    const setPlayingSubtitleIndex = vi.fn();
    const setActiveAuditionType = vi.fn();
    const setAuditionStopAtMs = vi.fn();
    const setSubtitleMuted = vi.fn();
    const setBgmMuted = vi.fn();
    const logEditorTransport = vi.fn();

    const flow = createPlaybackAuditionFlow({
      locale: 'zh',
      t: (key) => key,
      convertObj: null,
      getSubtitleTrack: () => [
        {
          id: 'clip-1',
          startTime: 1,
          duration: 2,
          audioUrl: '',
        },
      ],
      getTransportState: () => ({
        mode: 'timeline',
        status: 'paused',
        transportTimeSec: 0,
        activeClipIndex: null,
        auditionStopAtSec: null,
        autoPlayNext: false,
        pendingNextClipIndex: null,
        pendingNextMode: null,
        blockingState: null,
      }),
      getVideoElement: () => null,
      getSourceAuditionAudio: () => null,
      setSourceAuditionAudio: vi.fn(),
      getAuditionRestoreState: () => null,
      setAuditionRestoreState: vi.fn(),
      getSubtitleMuted: () => false,
      setSubtitleMuted,
      getBgmMuted: () => false,
      setBgmMuted,
      getVolume: () => 100,
      getActiveAuditionType: () => null,
      setActiveAuditionType,
      getAuditionStopAtMs: () => null,
      setAuditionStopAtMs,
      getPlayingSubtitleIndex: () => -1,
      setPlayingSubtitleIndex,
      nextAuditionToken: () => ++auditionToken,
      getAuditionToken: () => auditionToken,
      getAuditionAbortController: () => auditionController,
      setAuditionAbortController: (controller) => {
        auditionController = controller;
      },
      getAbortReason: () => new Error('aborted'),
      abortActiveAuditionPreparation: vi.fn(),
      clearAuditionNaturalStopTimer: vi.fn(),
      setTransportStalled: vi.fn(),
      nextVideoStartGateToken: vi.fn(() => 1),
      nextVideoPlayToken: vi.fn(() => 1),
      setIsVideoBuffering: vi.fn(),
      setIsPlaying: vi.fn(),
      dispatchTransport,
      logEditorTransport,
      getVideoSyncMode: (fallback = 'timeline') => fallback,
      getVideoTransportTimeSec: () => 0,
      applyVideoTransportSnapshot: vi.fn(async () => true),
      evaluateConvertAuditionGateForClipIndex: vi.fn(() => ({ kind: 'ready' as const })),
      createVoiceUnavailableBlockingState: vi.fn(),
      pausePlaybackForBlockingState: vi.fn(),
      handleSeek,
      ensureVoiceBuffer: vi.fn(),
      cacheGetVoice: vi.fn(() => null),
      handleAuditionStopFallback: vi.fn(),
    });

    await flow.handleAuditionRequestPlay(0, 'source');

    expect(dispatchTransport).not.toHaveBeenCalled();
    expect(handleSeek).not.toHaveBeenCalled();
    expect(setPlayingSubtitleIndex).not.toHaveBeenCalled();
    expect(setActiveAuditionType).not.toHaveBeenCalled();
    expect(setAuditionStopAtMs).not.toHaveBeenCalled();
    expect(setSubtitleMuted).not.toHaveBeenCalled();
    expect(setBgmMuted).not.toHaveBeenCalled();
    expect(auditionController).toBeNull();
    expect(logEditorTransport).toHaveBeenCalledWith(
      'warn',
      'source-audition-missing-context',
      expect.objectContaining({ clipId: 'clip-1', mode: 'source', index: 0 })
    );
    expect(toastError).toHaveBeenCalled();
  });
});
