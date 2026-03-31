import { toast } from 'sonner';

import type { SubtitleTrackItem } from '@/shared/components/video-editor/types';

import {
  auditionReady as markAuditionReady,
  pauseTimeline,
  playTimeline,
  stopAudition as stopTransportAudition,
  type EditorTransportAction,
  type EditorTransportState,
  type TransportBlockingReason,
  type TransportBlockingState,
} from '../../editor-transport';
import type { VideoPreviewRef } from '../../video-preview-panel';
import type { VideoSyncSnapshot } from '../../video-sync-controller';

type TranslateFn = (key: string, values?: Record<string, string | number | Date>) => string;

type MutableRefObjectLike<T> = {
  current: T;
};

type AuditionRestoreState = {
  subtitleMuted: boolean;
  bgmMuted: boolean;
  videoMuted: boolean;
};

type PlaybackGateState =
  | { kind: 'ready' }
  | {
      kind: 'voice_unavailable';
      clipIndex: number;
      subtitleId: string;
      reason: TransportBlockingReason;
    };

type BlockingClipContext = {
  clipIndex: number;
  clip: Pick<SubtitleTrackItem, 'id' | 'startTime' | 'audioUrl'>;
} | null;

type RetryablePlaybackContext = {
  clipIndex: number;
  subtitleId?: string;
};

type CreatePlaybackTransportOwnerArgs = {
  refs: {
    transportStateRef: MutableRefObjectLike<EditorTransportState>;
    subtitleBackendRef: MutableRefObjectLike<'webaudio' | 'media'>;
    auditionTokenRef: MutableRefObjectLike<number>;
    auditionActiveTypeRef: MutableRefObjectLike<'source' | 'convert' | null>;
    sourceAuditionAudioRef: MutableRefObjectLike<HTMLAudioElement | null>;
    auditionStopAtMsRef: MutableRefObjectLike<number | null>;
    auditionRestoreRef: MutableRefObjectLike<AuditionRestoreState | null>;
    videoPreviewRef: MutableRefObjectLike<VideoPreviewRef | null>;
    isSubtitleMutedRef: MutableRefObjectLike<boolean>;
    isBgmMutedRef: MutableRefObjectLike<boolean>;
    handleAuditionStopRef: MutableRefObjectLike<(naturalEnd?: boolean) => void>;
    lastPlayedSubtitleIndexRef: MutableRefObjectLike<number>;
    lastVoiceSubtitleIndexRef: MutableRefObjectLike<number>;
    isAudioRefArrPauseRef: MutableRefObjectLike<boolean>;
    subtitleTrackRef: MutableRefObjectLike<SubtitleTrackItem[]>;
    videoStartGateTokenRef: MutableRefObjectLike<number>;
    videoPlayTokenRef: MutableRefObjectLike<number>;
    transportIsStalledRef: MutableRefObjectLike<boolean>;
    subtitleRetryRef: MutableRefObjectLike<{ index: number; untilMs: number } | null>;
    subtitleKickRef: MutableRefObjectLike<{ index: number; atMs: number } | null>;
    subtitleWatchdogMsRef: MutableRefObjectLike<number>;
  };
  transportMode: EditorTransportState['mode'];
  isPlaying: boolean;
  isSubtitleBuffering: boolean;
  isVideoBuffering: boolean;
  t: TranslateFn;
  scrollToItem: (id: string) => void;
  handleSeek: (time: number, isDragging?: boolean, isAuditionSeek?: boolean) => void;
  abortActiveAuditionPreparation: () => void;
  abortAllVoiceInflight: () => void;
  applyVideoTransportSnapshot: (
    snapshot: VideoSyncSnapshot,
    opts?: { playReason?: string; seekToleranceSec?: number }
  ) => Promise<boolean>;
  getVideoSyncMode: (fallback?: VideoSyncSnapshot['mode']) => VideoSyncSnapshot['mode'];
  getVideoTransportTimeSec: (fallbackTimeSec?: number) => number;
  setPlaybackBlockingState: (next: TransportBlockingState | null) => void;
  stopAllSubtitleAudio: () => void;
  stopWebAudioVoice: () => void;
  setIsVideoBuffering: (value: boolean) => void;
  setIsSubtitleBuffering: (value: boolean) => void;
  setIsPlaying: (value: boolean) => void;
  setIsSubtitleMuted: (value: boolean) => void;
  setIsBgmMuted: (value: boolean) => void;
  setPlayingSubtitleIndex: (value: number) => void;
  dispatchTransport: (action: EditorTransportAction) => void;
  resolveBlockingClipContext: (state: TransportBlockingState | null) => BlockingClipContext;
  resolveRetryablePlaybackContext: (fallbackTimeSec: number, clipIndex?: number, subtitleId?: string) => RetryablePlaybackContext;
  evaluatePlaybackGateForClipIndex: (clipIndex: number) => PlaybackGateState;
  createVoiceUnavailableBlockingState: (gate: Extract<PlaybackGateState, { kind: 'voice_unavailable' }>) => TransportBlockingState;
  pausePlaybackForBlockingState: (nextState: TransportBlockingState, pauseAtSec?: number) => Promise<void>;
  handlePlaybackStartFailure: (args: {
    mode: VideoSyncSnapshot['mode'];
    timeSec: number;
    preferredClipIndex?: number;
    subtitleId?: string;
    retryCount?: number;
  }) => void;
  beginSubtitleBuffering: (reasonIndex: number, url: string) => Promise<void> | void;
  getOrCreateVoiceAudioCtx: () => AudioContext;
  cacheGetVoice: (key: string) => AudioBuffer | null;
  prefetchVoiceAroundTime: (time: number, opts?: { count?: number; signal?: AbortSignal }) => void;
  getAdaptivePrefetchCount: (mode: 'play' | 'pause' | 'lookahead') => number;
  findSubtitleIndexAtTime: (track: SubtitleTrackItem[], time: number) => number;
};

export function createPlaybackTransportOwner(args: CreatePlaybackTransportOwnerArgs) {
  const handleCancelBlockedPlayback = () => {
    const hadActiveAudition =
      args.refs.auditionActiveTypeRef.current != null ||
      args.refs.transportStateRef.current.mode === 'audition_source' ||
      args.refs.transportStateRef.current.mode === 'audition_convert';
    args.abortAllVoiceInflight();
    args.refs.videoStartGateTokenRef.current += 1;
    args.refs.videoPlayTokenRef.current += 1;
    args.refs.transportIsStalledRef.current = false;
    args.setIsVideoBuffering(false);
    args.setIsSubtitleBuffering(false);
    args.setIsPlaying(false);
    args.setPlaybackBlockingState(null);
    args.stopWebAudioVoice();
    args.stopAllSubtitleAudio();
    try {
      if (args.refs.sourceAuditionAudioRef.current) {
        args.refs.sourceAuditionAudioRef.current.onended = null;
        args.refs.sourceAuditionAudioRef.current.onerror = null;
        args.refs.sourceAuditionAudioRef.current.ontimeupdate = null;
        args.refs.sourceAuditionAudioRef.current.pause();
      }
    } catch {
      // ignore
    }
    args.refs.auditionActiveTypeRef.current = null;
    args.refs.auditionStopAtMsRef.current = null;
    if (args.refs.auditionRestoreRef.current) {
      const { subtitleMuted, bgmMuted, videoMuted } = args.refs.auditionRestoreRef.current;
      args.setIsSubtitleMuted(subtitleMuted);
      args.refs.isSubtitleMutedRef.current = subtitleMuted;
      args.setIsBgmMuted(bgmMuted);
      args.refs.isBgmMutedRef.current = bgmMuted;
      if (args.refs.videoPreviewRef.current?.videoElement) {
        args.refs.videoPreviewRef.current.videoElement.muted = videoMuted;
      }
      args.refs.auditionRestoreRef.current = null;
    }
    args.dispatchTransport(hadActiveAudition ? stopTransportAudition() : pauseTimeline());
    void args.applyVideoTransportSnapshot(
      {
        mode: args.getVideoSyncMode(),
        status: 'paused',
        transportTimeSec: args.getVideoTransportTimeSec(),
      },
      {
        seekToleranceSec: 0,
      }
    );
  };

  const handleLocateBlockedClip = () => {
    const resolved = args.resolveBlockingClipContext(args.refs.transportStateRef.current.blockingState);
    if (!resolved) return;
    args.scrollToItem(resolved.clip.id);
    args.handleSeek(resolved.clip.startTime, false);
  };

  const handleRetryBlockedPlayback = () => {
    const blockingState = args.refs.transportStateRef.current.blockingState;
    if (!blockingState) return;
    const resolved = args.resolveBlockingClipContext(blockingState);

    if (!resolved && blockingState.kind !== 'network_failed') return;

    if (resolved) {
      const gate = args.evaluatePlaybackGateForClipIndex(resolved.clipIndex);
      if (gate.kind === 'voice_unavailable') {
        args.setPlayingSubtitleIndex(resolved.clipIndex);
        void args.pausePlaybackForBlockingState(args.createVoiceUnavailableBlockingState(gate), resolved.clip.startTime);
        return;
      }
    }

    if (blockingState.kind === 'network_failed') {
      const retryCount = Math.max(1, Number(blockingState.retryCount || 0) + 1);
      const nextMode = args.getVideoSyncMode();
      const fallbackTimeSec = args.getVideoTransportTimeSec();
      const retryContext = args.resolveRetryablePlaybackContext(
        fallbackTimeSec,
        resolved?.clipIndex ?? blockingState.clipIndex,
        resolved?.clip.id ?? blockingState.subtitleId
      );

      if (args.refs.subtitleBackendRef.current === 'media' || !resolved) {
        const retryClipIndex = retryContext.clipIndex;
        const retrySubtitleId = retryContext.subtitleId;
        const retryStartTimeSec = resolved?.clip.startTime ?? fallbackTimeSec;
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        args.refs.subtitleRetryRef.current = null;
        args.refs.subtitleKickRef.current = null;
        args.refs.subtitleWatchdogMsRef.current = now;
        args.refs.lastPlayedSubtitleIndexRef.current = -1;
        args.refs.lastVoiceSubtitleIndexRef.current = -1;
        args.setPlayingSubtitleIndex(retryClipIndex);
        args.setPlaybackBlockingState({
          kind: 'retrying',
          clipIndex: retryClipIndex,
          subtitleId: retrySubtitleId,
          retryCount,
        });
        args.stopWebAudioVoice();
        args.stopAllSubtitleAudio();

        void (async () => {
          const syncStarted = await args.applyVideoTransportSnapshot(
            {
              mode: nextMode,
              status: 'playing',
              transportTimeSec: retryStartTimeSec,
            },
            {
              playReason: 'blocked-retry',
              seekToleranceSec: 0,
            }
          );

          if (!syncStarted) {
            args.handlePlaybackStartFailure({
              mode: nextMode,
              timeSec: retryStartTimeSec,
              preferredClipIndex: retryClipIndex,
              subtitleId: retrySubtitleId,
              retryCount,
            });
            return;
          }

          args.setPlaybackBlockingState(null);
          args.dispatchTransport(nextMode === 'timeline' ? playTimeline() : markAuditionReady());
        })();
        return;
      }
    }

    if (!resolved) return;

    const gate = args.evaluatePlaybackGateForClipIndex(resolved.clipIndex);
    if (gate.kind === 'voice_unavailable') {
      args.setPlayingSubtitleIndex(resolved.clipIndex);
      void args.pausePlaybackForBlockingState(args.createVoiceUnavailableBlockingState(gate), resolved.clip.startTime);
      return;
    }

    const url = String(resolved.clip.audioUrl || '').trim();
    if (!url) return;

    args.abortAllVoiceInflight();
    args.setPlaybackBlockingState(null);
    void args.beginSubtitleBuffering(resolved.clipIndex, url);
  };

  const handlePlayPause = () => {
    args.refs.auditionTokenRef.current += 1;
    args.abortActiveAuditionPreparation();
    const hadActiveAudition =
      args.refs.auditionActiveTypeRef.current != null ||
      args.transportMode === 'audition_source' ||
      args.transportMode === 'audition_convert';
    const videoEl = args.refs.videoPreviewRef.current?.videoElement;
    const blockingState = args.refs.transportStateRef.current.blockingState;
    if (args.isSubtitleBuffering) {
      args.abortAllVoiceInflight();
      args.setIsSubtitleBuffering(false);
      args.setPlaybackBlockingState(null);
      args.refs.videoPlayTokenRef.current += 1;
      args.refs.transportIsStalledRef.current = false;
      args.dispatchTransport(hadActiveAudition ? stopTransportAudition() : pauseTimeline());
      return;
    }
    if (!args.isPlaying && args.isVideoBuffering) {
      args.refs.videoStartGateTokenRef.current += 1;
      args.refs.videoPlayTokenRef.current += 1;
      args.refs.transportIsStalledRef.current = false;
      args.setIsVideoBuffering(false);
      args.dispatchTransport(hadActiveAudition ? stopTransportAudition() : pauseTimeline());
      return;
    }
    if (args.isPlaying) {
      if (hadActiveAudition) {
        args.refs.handleAuditionStopRef.current(false);
        return;
      }
      args.dispatchTransport(pauseTimeline());
      void args.applyVideoTransportSnapshot(
        {
          mode: args.getVideoSyncMode(),
          status: 'paused',
          transportTimeSec: args.getVideoTransportTimeSec(),
        },
        {
          seekToleranceSec: 0,
        }
      );
      args.refs.videoPlayTokenRef.current += 1;
      args.refs.transportIsStalledRef.current = false;
      args.setIsPlaying(false);
      return;
    }

    if (blockingState?.kind === 'network_failed') {
      handleRetryBlockedPlayback();
      return;
    }

    if (blockingState?.kind === 'voice_unavailable') {
      handleLocateBlockedClip();
      return;
    }

    args.refs.lastPlayedSubtitleIndexRef.current = -1;
    args.refs.lastVoiceSubtitleIndexRef.current = -1;
    args.refs.isAudioRefArrPauseRef.current = false;
    args.stopWebAudioVoice();
    args.abortAllVoiceInflight();

    try {
      const transportTime =
        Number.isFinite(videoEl?.currentTime) && videoEl?.currentTime != null ? videoEl.currentTime || 0 : args.getVideoTransportTimeSec();
      const track = args.refs.subtitleTrackRef.current;
      const idx = args.findSubtitleIndexAtTime(track, transportTime);
      if (idx !== -1) {
        const gate = args.evaluatePlaybackGateForClipIndex(idx);
        if (gate.kind === 'voice_unavailable') {
          const segment = track[idx];
          args.setPlayingSubtitleIndex(idx);
          void args.pausePlaybackForBlockingState(args.createVoiceUnavailableBlockingState(gate), segment?.startTime);
          return;
        }
      }

      if (args.refs.subtitleBackendRef.current === 'webaudio') {
        try {
          const ctx = args.getOrCreateVoiceAudioCtx();
          void ctx.resume().catch(() => {
            // ignore
          });
        } catch (error) {
          console.error('[VoiceEngine] init failed, falling back to <audio>:', error);
          args.refs.subtitleBackendRef.current = 'media';
        }

        if (idx !== -1) {
          const segment = track[idx];
          const url = (segment?.audioUrl || '').trim();
          if (url && !args.cacheGetVoice(url)) {
            void args.beginSubtitleBuffering(idx, url);
            return;
          }
        }

        args.prefetchVoiceAroundTime(transportTime, { count: args.getAdaptivePrefetchCount('play') });
      }
    } catch {
      // ignore
    }

    if (!videoEl || !(videoEl.currentSrc || videoEl.src)) {
      toast.error(args.t('videoEditor.toast.addVideoFirst'));
      args.setIsPlaying(false);
      return;
    }
    args.refs.transportIsStalledRef.current = false;
    void (async () => {
      const syncStarted = await args.applyVideoTransportSnapshot(
        {
          mode: args.getVideoSyncMode('timeline'),
          status: 'playing',
          transportTimeSec: args.getVideoTransportTimeSec(),
        },
        {
          playReason: 'user-play',
        }
      );

      if (!syncStarted) {
        args.handlePlaybackStartFailure({
          mode: 'timeline',
          timeSec: args.getVideoTransportTimeSec(),
          preferredClipIndex: args.findSubtitleIndexAtTime(args.refs.subtitleTrackRef.current, args.getVideoTransportTimeSec()),
          retryCount: 1,
        });
        return;
      }

      args.dispatchTransport(playTimeline());
    })();
  };

  return {
    handleCancelBlockedPlayback,
    handleLocateBlockedClip,
    handleRetryBlockedPlayback,
    handlePlayPause,
  };
}
