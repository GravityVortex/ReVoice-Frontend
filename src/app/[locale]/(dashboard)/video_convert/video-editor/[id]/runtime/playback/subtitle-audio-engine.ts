import { toast } from 'sonner';

import type { TransportBlockingState } from '../../editor-transport';
import { playTimeline } from '../../editor-transport';
import type { VideoSyncSnapshot } from '../../video-sync-controller';

type LogLevel = 'debug' | 'warn' | 'error';

type SubtitleTrackItemLike = {
  id: string;
  startTime: number;
  duration: number;
};

type CreateSubtitleAudioEngineArgs = {
  locale: string;
  getIsSubtitleBuffering: () => boolean;
  getSubtitleTrack: () => SubtitleTrackItemLike[];
  getVideoElement: () => HTMLVideoElement | null | undefined;
  getVideoSyncMode: (fallback?: VideoSyncSnapshot['mode']) => VideoSyncSnapshot['mode'];
  getVideoTransportTimeSec: (fallbackTimeSec?: number) => number;
  applyVideoTransportSnapshot: (
    snapshot: VideoSyncSnapshot,
    opts?: { playReason?: string; seekToleranceSec?: number }
  ) => Promise<boolean>;
  ensureVoiceBuffer: (url: string, signal: AbortSignal) => Promise<unknown>;
  waitForVoiceRetryDelay: (signal: AbortSignal, delayMs: number) => Promise<void>;
  isRecoverableVoiceLoadError: (error: unknown) => boolean;
  logEditorTransport: (level: LogLevel, event: string, meta: Record<string, unknown>) => void;
  handlePlaybackStartFailure: (args: {
    mode: VideoSyncSnapshot['mode'];
    timeSec: number;
    preferredClipIndex?: number | null;
    subtitleId?: string;
    retryCount?: number;
  }) => void;
  pausePlaybackForBlockingState: (nextState: TransportBlockingState, pauseAtSec?: number) => Promise<void>;
  setPlaybackBlockingState: (next: TransportBlockingState | null) => void;
  setIsSubtitleBuffering: (value: boolean) => void;
  setIsPlaying: (value: boolean) => void;
  setTransportStalled: (value: boolean) => void;
  nextVideoPlayToken: () => number;
  stopWebAudioVoice: () => void;
  stopAllSubtitleAudio: () => void;
  pauseBgm: () => void;
  getVoiceAudioContext: () => AudioContext | null;
  getAbortReason: () => unknown;
  getBufferingAbortController: () => AbortController | null;
  setBufferingAbortController: (controller: AbortController | null) => void;
  createNetworkFailedBlockingState: (clipIndex: number, subtitleId?: string, retryCount?: number) => TransportBlockingState;
  dispatchTransport: (action: ReturnType<typeof playTimeline>) => void;
};

const VOICE_FETCH_RETRY_WINDOW_MS = 8_000;
const VOICE_FETCH_RETRY_DELAY_MS = 600;

export function createSubtitleAudioEngine(args: CreateSubtitleAudioEngineArgs) {
  const beginSubtitleBuffering = async (reasonIndex: number, url: string) => {
    if (args.getIsSubtitleBuffering()) return;
    const clip = args.getSubtitleTrack()[reasonIndex];
    const pauseAtSec = clip?.startTime ?? args.getVideoTransportTimeSec();
    args.setPlaybackBlockingState({
      kind: 'loading',
      clipIndex: reasonIndex,
      subtitleId: clip?.id ?? `clip-${reasonIndex}`,
      retryCount: 0,
    });
    args.setIsSubtitleBuffering(true);
    try {
      args.getBufferingAbortController()?.abort(args.getAbortReason());
    } catch {
      // ignore
    }
    const controller = new AbortController();
    args.setBufferingAbortController(controller);
    const releaseBufferingAbortController = () => {
      if (args.getBufferingAbortController() === controller) {
        args.setBufferingAbortController(null);
      }
    };
    args.nextVideoPlayToken();
    args.setTransportStalled(false);

    const videoEl = args.getVideoElement();
    if (!videoEl || !(videoEl.currentSrc || videoEl.src)) {
      args.pauseBgm();
      args.stopWebAudioVoice();
      args.stopAllSubtitleAudio();
      args.setIsPlaying(false);
      args.setIsSubtitleBuffering(false);
      args.setPlaybackBlockingState(null);
      releaseBufferingAbortController();
      return;
    }

    await args.applyVideoTransportSnapshot(
      {
        mode: args.getVideoSyncMode(),
        status: 'paused',
        transportTimeSec: pauseAtSec,
      },
      {
        seekToleranceSec: 0,
      }
    );
    args.pauseBgm();
    args.stopWebAudioVoice();
    args.stopAllSubtitleAudio();
    args.setIsPlaying(false);

    try {
      const startedAtMs = Date.now();
      let retryCount = 0;
      for (;;) {
        try {
          await args.ensureVoiceBuffer(url, controller.signal);
          break;
        } catch (error) {
          if (controller.signal.aborted) return;
          if (!args.isRecoverableVoiceLoadError(error)) throw error;

          retryCount += 1;
          const elapsedMs = Date.now() - startedAtMs;
          if (elapsedMs >= VOICE_FETCH_RETRY_WINDOW_MS) {
            await args.pausePlaybackForBlockingState(
              {
                kind: 'network_failed',
                clipIndex: reasonIndex,
                subtitleId: clip?.id ?? `clip-${reasonIndex}`,
                retryCount,
              },
              pauseAtSec
            );
            return;
          }

          args.setPlaybackBlockingState({
            kind: 'retrying',
            clipIndex: reasonIndex,
            subtitleId: clip?.id ?? `clip-${reasonIndex}`,
            retryCount,
          });
          await args.waitForVoiceRetryDelay(controller.signal, VOICE_FETCH_RETRY_DELAY_MS);
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      args.logEditorTransport('error', 'subtitle-buffer-decode-failed', {
        clipId: args.getSubtitleTrack()[reasonIndex]?.id ?? null,
        mode: args.getVideoSyncMode(),
        error,
      });
      args.setIsSubtitleBuffering(false);
      args.setPlaybackBlockingState(null);
      releaseBufferingAbortController();
      toast.error(args.locale === 'zh' ? '语音解码失败，已切换到兼容模式' : 'Voice decode failed, switched to compatibility mode');
      return;
    }

    if (controller.signal.aborted) return;
    args.setIsSubtitleBuffering(false);
    args.setPlaybackBlockingState({
      kind: 'retrying',
      clipIndex: reasonIndex,
      subtitleId: clip?.id ?? `clip-${reasonIndex}`,
      retryCount: 1,
    });

    try {
      void args.getVoiceAudioContext()?.resume?.().catch(() => {
        // ignore
      });
      const syncStarted = await args.applyVideoTransportSnapshot(
        {
          mode: args.getVideoSyncMode(),
          status: 'playing',
          transportTimeSec: args.getVideoTransportTimeSec(),
        },
        {
          playReason: 'subtitle-buffering-resume',
        }
      );

      if (!syncStarted) {
        args.handlePlaybackStartFailure({
          mode: args.getVideoSyncMode(),
          timeSec: args.getVideoTransportTimeSec(),
          preferredClipIndex: reasonIndex,
          subtitleId: clip?.id ?? `clip-${reasonIndex}`,
          retryCount: 1,
        });
        return;
      }

      args.setPlaybackBlockingState(null);
      args.dispatchTransport(playTimeline());
    } catch (error) {
      if (controller.signal.aborted) return;
      args.logEditorTransport('error', 'subtitle-buffer-resume-failed', {
        clipId: args.getSubtitleTrack()[reasonIndex]?.id ?? null,
        mode: args.getVideoSyncMode(),
        error,
      });
      args.handlePlaybackStartFailure({
        mode: args.getVideoSyncMode(),
        timeSec: args.getVideoTransportTimeSec(),
        preferredClipIndex: reasonIndex,
        subtitleId: clip?.id ?? `clip-${reasonIndex}`,
        retryCount: 1,
      });
    } finally {
      releaseBufferingAbortController();
    }
  };

  return {
    beginSubtitleBuffering,
  };
}
