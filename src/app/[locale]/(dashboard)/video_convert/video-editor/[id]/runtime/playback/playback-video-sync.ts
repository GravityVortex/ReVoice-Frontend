import { toast } from 'sonner';

import { getBufferedAheadSeconds } from '@/shared/lib/media-buffer';

import { createVideoSyncController, type VideoSyncSnapshot } from '../../video-sync-controller';

type TranslateFn = (key: string, values?: Record<string, string | number | Date>) => string;

type ActiveAuditionType = 'source' | 'convert' | null;

type CreatePlaybackVideoSyncArgs = {
  currentTime: number;
  t: TranslateFn;
  getVideoElement: () => HTMLVideoElement | null | undefined;
  getActiveAuditionType: () => ActiveAuditionType;
  getTransportMode: () => VideoSyncSnapshot['mode'];
  getTransportTimeSec: () => number;
  getVideoStartGateToken: () => number;
  nextVideoStartGateToken: () => number;
  getVideoPlayToken: () => number;
  nextVideoPlayToken: () => number;
  getMinStartBufferSeconds: () => number;
  setTransportStalled: (stalled: boolean) => void;
  setIsVideoBuffering: (value: boolean) => void;
  setIsPlaying: (value: boolean) => void;
  isAbortError: (error: unknown) => boolean;
};

type WaitForVideoWarmupArgs = {
  videoEl: HTMLVideoElement;
  gateToken: number;
  getCurrentGateToken: () => number;
  minBufferSeconds: number;
  timeoutMs: number;
};

type PlayVideoWithGateArgs = {
  videoEl: HTMLVideoElement;
  reason: string;
};

type ResolveVideoTransportTimeSecArgs = {
  videoCurrentTime?: number;
  transportTimeSec?: number;
  fallbackTimeSec?: number;
};

export function resolveVideoSyncMode(
  activeAuditionType: ActiveAuditionType,
  fallbackMode: VideoSyncSnapshot['mode']
): VideoSyncSnapshot['mode'] {
  if (activeAuditionType === 'source') return 'audition_source';
  if (activeAuditionType === 'convert') return 'audition_convert';
  return fallbackMode;
}

export function resolveVideoTransportTimeSec(args: ResolveVideoTransportTimeSecArgs) {
  if (Number.isFinite(args.videoCurrentTime)) {
    return Math.max(0, args.videoCurrentTime || 0);
  }
  if (Number.isFinite(args.transportTimeSec)) {
    return Math.max(0, args.transportTimeSec || 0);
  }
  return Math.max(0, args.fallbackTimeSec || 0);
}

export async function waitForVideoWarmup(args: WaitForVideoWarmupArgs) {
  const { videoEl, gateToken, getCurrentGateToken, minBufferSeconds, timeoutMs } = args;
  const startedAtMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const clampedTimeoutMs = Math.max(0, timeoutMs);

  try {
    if (videoEl.readyState === 0) videoEl.load();
  } catch {
    // ignore
  }

  while (videoEl.readyState < 1) {
    if (gateToken !== getCurrentGateToken()) return false;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - startedAtMs > clampedTimeoutMs) return false;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }

  const minAhead = Math.max(0, minBufferSeconds);
  if (minAhead <= 0) return true;

  while (true) {
    if (gateToken !== getCurrentGateToken()) return false;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - startedAtMs > clampedTimeoutMs) return false;
    if (videoEl.readyState >= 3) return true;

    const ahead = getBufferedAheadSeconds(videoEl.buffered as TimeRanges, videoEl.currentTime);
    if (ahead >= minAhead) return true;

    await new Promise((resolve) => setTimeout(resolve, 120));
  }
}

export function createPlaybackVideoSync(args: CreatePlaybackVideoSyncArgs) {
  const getVideoSyncMode = (fallback: VideoSyncSnapshot['mode'] = args.getTransportMode()): VideoSyncSnapshot['mode'] =>
    resolveVideoSyncMode(args.getActiveAuditionType(), fallback);

  const getVideoTransportTimeSec = (fallbackTimeSec = args.currentTime) =>
    resolveVideoTransportTimeSec({
      videoCurrentTime: args.getVideoElement()?.currentTime,
      transportTimeSec: args.getTransportTimeSec(),
      fallbackTimeSec,
    });

  const playVideoWithGate = async ({ videoEl, reason }: PlayVideoWithGateArgs) => {
    const src = videoEl.currentSrc || videoEl.src || '';
    if (!src) return false;

    const gateToken = args.nextVideoStartGateToken();
    args.setTransportStalled(false);
    args.setIsVideoBuffering(true);

    const warmedUp = await waitForVideoWarmup({
      videoEl,
      gateToken,
      getCurrentGateToken: args.getVideoStartGateToken,
      minBufferSeconds: args.getMinStartBufferSeconds(),
      timeoutMs: 12_000,
    });
    if (!warmedUp || gateToken !== args.getVideoStartGateToken()) {
      args.setIsVideoBuffering(false);
      return false;
    }

    const playToken = args.nextVideoPlayToken();
    try {
      await videoEl.play();
      if (playToken === args.getVideoPlayToken()) {
        args.setIsVideoBuffering(false);
        args.setIsPlaying(true);
        return true;
      }
      args.setIsVideoBuffering(false);
      return false;
    } catch (error) {
      if (playToken !== args.getVideoPlayToken()) {
        args.setIsVideoBuffering(false);
        return false;
      }
      if (args.isAbortError(error)) {
        args.setIsVideoBuffering(false);
        return false;
      }
      console.error('[VideoSync]', 'play-failed', { reason, error });
      const name = error && typeof error === 'object' && 'name' in error ? String((error as { name?: unknown }).name || '') : '';
      const message =
        error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message || '') : '';
      if (name === 'NotSupportedError') {
        toast.error(args.t('videoEditor.toast.videoLoadFailed'));
      } else {
        toast.error(args.t('videoEditor.toast.playFailed', { error: message || args.t('videoEditor.toast.unknownError') }));
      }
      args.setIsPlaying(false);
      args.setIsVideoBuffering(false);
      return false;
    }
  };

  const applyVideoTransportSnapshot = async (
    snapshot: VideoSyncSnapshot,
    opts?: { playReason?: string; seekToleranceSec?: number }
  ) => {
    const videoEl = args.getVideoElement();
    if (!videoEl) return false;

    const controller = createVideoSyncController(videoEl, {
      seekToleranceSec: opts?.seekToleranceSec,
      play: () =>
        playVideoWithGate({
          videoEl,
          reason: opts?.playReason || `transport-${snapshot.mode}`,
        }),
      pause: () => {
        try {
          videoEl.pause();
        } catch {
          // ignore
        }
      },
    });

    return await controller.apply(snapshot);
  };

  return {
    waitForVideoWarmup,
    playVideoWithGate,
    getVideoSyncMode,
    getVideoTransportTimeSec,
    applyVideoTransportSnapshot,
  };
}
