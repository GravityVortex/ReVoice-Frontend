import type { SubtitleTrackItem } from '@/shared/components/video-editor/types';

import {
  seekTransport as _seekTransport,
  pauseTimeline,
  stopAudition as stopTransportAudition,
  type EditorTransportAction,
  type EditorTransportState,
  type TransportBlockingState,
} from '../../editor-transport';
import type { VideoPreviewRef } from '../../video-preview-panel';
import type { VideoSyncSnapshot } from '../../video-sync-controller';

type MutableRefObjectLike<T> = {
  current: T;
};

type AuditionRestoreState = {
  subtitleMuted: boolean;
  bgmMuted: boolean;
  videoMuted: boolean;
};

type CreatePlaybackSeekOwnerArgs = {
  refs: {
    videoPreviewRef: MutableRefObjectLike<VideoPreviewRef | null>;
    seekDragActiveRef: MutableRefObjectLike<boolean>;
    seekDragRafRef: MutableRefObjectLike<number | null>;
    seekDragLatestTimeRef: MutableRefObjectLike<number>;
    seekDragLastMediaApplyMsRef: MutableRefObjectLike<number>;
    videoStartGateTokenRef: MutableRefObjectLike<number>;
    videoPlayTokenRef: MutableRefObjectLike<number>;
    transportIsStalledRef: MutableRefObjectLike<boolean>;
    subtitleGraceUntilMsRef: MutableRefObjectLike<number>;
    subtitleKickRef: MutableRefObjectLike<{ index: number; atMs: number } | null>;
    subtitleRetryRef: MutableRefObjectLike<{ index: number; untilMs: number } | null>;
    subtitleWatchdogMsRef: MutableRefObjectLike<number>;
    subtitlePlayTokenRef: MutableRefObjectLike<number>;
    lastPlayedSubtitleIndexRef: MutableRefObjectLike<number>;
    lastVoiceSubtitleIndexRef: MutableRefObjectLike<number>;
    bufferingAbortRef: MutableRefObjectLike<AbortController | null>;
    isAudioRefArrPauseRef: MutableRefObjectLike<boolean>;
    auditionTokenRef: MutableRefObjectLike<number>;
    auditionActiveTypeRef: MutableRefObjectLike<'source' | 'convert' | null>;
    auditionStopAtMsRef: MutableRefObjectLike<number | null>;
    auditionRestoreRef: MutableRefObjectLike<AuditionRestoreState | null>;
    sourceAuditionAudioRef: MutableRefObjectLike<HTMLAudioElement | null>;
    isSubtitleMutedRef: MutableRefObjectLike<boolean>;
    isBgmMutedRef: MutableRefObjectLike<boolean>;
    handleAuditionStopRef: MutableRefObjectLike<(naturalEnd?: boolean) => void>;
    lastUiTimeRef: MutableRefObjectLike<number>;
    subtitleTrackRef: MutableRefObjectLike<SubtitleTrackItem[]>;
    bgmAudioRef: MutableRefObjectLike<HTMLAudioElement | null>;
  };
  totalDuration: number;
  transportMode: EditorTransportState['mode'];
  isPlaying: boolean;
  abortReason: unknown;
  setIsVideoBuffering: (value: boolean) => void;
  setIsSubtitleBuffering: (value: boolean) => void;
  setIsPlaying: (value: boolean) => void;
  setIsSubtitleMuted: (value: boolean) => void;
  setIsBgmMuted: (value: boolean) => void;
  setCurrentTime: (value: number) => void;
  setPlayingSubtitleIndex: (value: number) => void;
  dispatchTransport: (action: EditorTransportAction) => void;
  cancelUpdateLoop: () => void;
  setPlaybackBlockingState: (state: TransportBlockingState | null) => void;
  stopWebAudioVoice: () => void;
  abortAllVoiceInflight: () => void;
  stopAllSubtitleAudio: () => void;
  abortActiveAuditionPreparation: () => void;
  applyVideoTransportSnapshot: (
    snapshot: VideoSyncSnapshot,
    opts?: { playReason?: string; seekToleranceSec?: number }
  ) => Promise<boolean>;
  getVideoSyncMode: (fallback?: VideoSyncSnapshot['mode']) => VideoSyncSnapshot['mode'];
  getVideoTransportTimeSec: (fallbackTimeSec?: number) => number;
  findSubtitleIndexAtTime: (track: SubtitleTrackItem[], time: number) => number;
};

export function createPlaybackSeekOwner(args: CreatePlaybackSeekOwnerArgs) {
  const handleSeek = (time: number, isDragging = false, isAuditionSeek = false) => {
    const clampedTime = Math.max(0, Math.min(time, args.totalDuration));
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const videoEl = args.refs.videoPreviewRef.current?.videoElement;
    const hadActiveAudition =
      args.refs.auditionActiveTypeRef.current != null ||
      args.transportMode === 'audition_source' ||
      args.transportMode === 'audition_convert';

    if (isDragging) {
      if (!args.refs.seekDragActiveRef.current) {
        args.refs.seekDragActiveRef.current = true;
        args.refs.videoStartGateTokenRef.current += 1;
        args.refs.videoPlayTokenRef.current += 1;
        args.refs.transportIsStalledRef.current = false;
        args.setIsVideoBuffering(false);
        args.cancelUpdateLoop();

        args.refs.subtitleGraceUntilMsRef.current = now + 900;
        args.refs.subtitleKickRef.current = null;
        args.refs.subtitleRetryRef.current = null;
        args.refs.subtitleWatchdogMsRef.current = now;
        args.refs.subtitlePlayTokenRef.current += 1;
        args.refs.lastPlayedSubtitleIndexRef.current = -1;
        args.setPlayingSubtitleIndex(-1);
        args.refs.lastVoiceSubtitleIndexRef.current = -1;
        try {
          args.refs.bufferingAbortRef.current?.abort(args.abortReason);
        } catch {
          // ignore
        }
        args.refs.bufferingAbortRef.current = null;
        args.setIsSubtitleBuffering(false);
        args.setPlaybackBlockingState(null);
        args.stopWebAudioVoice();
        args.abortAllVoiceInflight();

        if (hadActiveAudition) {
          args.refs.auditionTokenRef.current += 1;
          args.refs.handleAuditionStopRef.current(false);
        } else if (args.isPlaying || (videoEl && !videoEl.paused)) {
          void args.applyVideoTransportSnapshot(
            {
              mode: args.getVideoSyncMode(),
              status: 'paused',
              transportTimeSec: args.getVideoTransportTimeSec(clampedTime),
            },
            {
              seekToleranceSec: 0,
            }
          );
          try {
            args.refs.bgmAudioRef.current?.pause();
          } catch {
            // ignore
          }
          args.setIsPlaying(false);
          args.dispatchTransport(hadActiveAudition ? stopTransportAudition() : pauseTimeline());
        }

        args.stopAllSubtitleAudio();
        args.refs.isAudioRefArrPauseRef.current = true;
      }

      args.refs.seekDragLatestTimeRef.current = clampedTime;
      if (args.refs.seekDragRafRef.current == null) {
        args.refs.seekDragRafRef.current = requestAnimationFrame(() => {
          args.refs.seekDragRafRef.current = null;
          if (!args.refs.seekDragActiveRef.current) return;
          const dragTime = args.refs.seekDragLatestTimeRef.current;

          args.refs.lastUiTimeRef.current = dragTime;
          args.setCurrentTime(dragTime);
          args.dispatchTransport(_seekTransport(dragTime));

          const msNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
          if (msNow - args.refs.seekDragLastMediaApplyMsRef.current < 140) return;
          args.refs.seekDragLastMediaApplyMsRef.current = msNow;

          void args.applyVideoTransportSnapshot(
            {
              mode: args.getVideoSyncMode(),
              status: 'paused',
              transportTimeSec: dragTime,
            },
            {
              seekToleranceSec: 0,
            }
          );
          try {
            if (args.refs.bgmAudioRef.current) {
              args.refs.bgmAudioRef.current.currentTime = dragTime;
            }
          } catch {
            // ignore
          }
        });
      }

      return;
    }

    const wasDragging = args.refs.seekDragActiveRef.current;
    args.refs.seekDragActiveRef.current = false;
    if (args.refs.seekDragRafRef.current != null) {
      cancelAnimationFrame(args.refs.seekDragRafRef.current);
      args.refs.seekDragRafRef.current = null;
    }

    args.refs.videoStartGateTokenRef.current += 1;
    args.refs.videoPlayTokenRef.current += 1;
    args.refs.transportIsStalledRef.current = false;
    args.setIsVideoBuffering(false);
    args.cancelUpdateLoop();
    args.setPlaybackBlockingState(null);

    args.refs.lastUiTimeRef.current = clampedTime;
    args.setCurrentTime(clampedTime);
    args.dispatchTransport(_seekTransport(clampedTime));

    if (wasDragging) {
      args.refs.isAudioRefArrPauseRef.current = false;
      void args.applyVideoTransportSnapshot(
        {
          mode: args.getVideoSyncMode(),
          status: 'paused',
          transportTimeSec: clampedTime,
        },
        {
          seekToleranceSec: 0,
        }
      );
      try {
        if (args.refs.bgmAudioRef.current) {
          args.refs.bgmAudioRef.current.currentTime = clampedTime;
        }
      } catch {
        // ignore
      }
      const dragEndIdx = args.findSubtitleIndexAtTime(args.refs.subtitleTrackRef.current, clampedTime);
      args.setPlayingSubtitleIndex(dragEndIdx);
      return;
    }

    if (!isAuditionSeek) {
      args.refs.auditionTokenRef.current += 1;
      args.abortActiveAuditionPreparation();
      args.dispatchTransport(hadActiveAudition ? stopTransportAudition() : pauseTimeline());
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
      args.refs.auditionActiveTypeRef.current = null;
      args.refs.auditionStopAtMsRef.current = null;
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
    }

    if (!isAuditionSeek) {
      args.refs.subtitleGraceUntilMsRef.current = now + 900;
      args.refs.subtitleKickRef.current = null;
      args.refs.subtitleRetryRef.current = null;
      args.refs.subtitleWatchdogMsRef.current = now;
      args.refs.subtitlePlayTokenRef.current += 1;
      args.refs.lastPlayedSubtitleIndexRef.current = -1;
      args.refs.lastVoiceSubtitleIndexRef.current = -1;
      try {
        args.refs.bufferingAbortRef.current?.abort(args.abortReason);
      } catch {
        // ignore
      }
      args.refs.bufferingAbortRef.current = null;
      args.setIsSubtitleBuffering(false);
      args.stopWebAudioVoice();
      args.abortAllVoiceInflight();

      args.refs.isAudioRefArrPauseRef.current = false;
      if (args.isPlaying || (videoEl && !videoEl.paused)) {
        void args.applyVideoTransportSnapshot(
          {
            mode: args.getVideoSyncMode(),
            status: 'paused',
            transportTimeSec: args.getVideoTransportTimeSec(clampedTime),
          },
          {
            seekToleranceSec: 0,
          }
        );
        try {
          args.refs.bgmAudioRef.current?.pause();
        } catch {
          // ignore
        }
        args.stopAllSubtitleAudio();
        args.setIsPlaying(false);
        args.dispatchTransport(hadActiveAudition ? stopTransportAudition() : pauseTimeline());
      }
    }

    void args.applyVideoTransportSnapshot(
      {
        mode: args.getVideoSyncMode(),
        status: 'paused',
        transportTimeSec: clampedTime,
      },
      {
        seekToleranceSec: 0,
      }
    );
    try {
      if (args.refs.bgmAudioRef.current) {
        args.refs.bgmAudioRef.current.currentTime = clampedTime;
      }
    } catch {
      // ignore
    }

    args.stopAllSubtitleAudio();

    if (!isAuditionSeek) {
      const seekedIdx = args.findSubtitleIndexAtTime(args.refs.subtitleTrackRef.current, clampedTime);
      args.setPlayingSubtitleIndex(seekedIdx);
    }
  };

  const handleSeekToSubtitle = (time: number) => {
    handleSeek(time, false);
  };

  return {
    handleSeek,
    handleSeekToSubtitle,
  };
}
