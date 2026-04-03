import { pauseTimeline, stopAudition as stopTransportAudition, type EditorTransportAction, type EditorTransportState, type TransportBlockingState } from '../../editor-transport';
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

type CreatePlaybackBlockingOwnerArgs = {
  refs: {
    transportStateRef: MutableRefObjectLike<EditorTransportState>;
    auditionActiveTypeRef: MutableRefObjectLike<'source' | 'convert' | null>;
    sourceAuditionAudioRef: MutableRefObjectLike<HTMLAudioElement | null>;
    auditionStopAtMsRef: MutableRefObjectLike<number | null>;
    auditionRestoreRef: MutableRefObjectLike<AuditionRestoreState | null>;
    videoPreviewRef: MutableRefObjectLike<VideoPreviewRef | null>;
    isSubtitleMutedRef: MutableRefObjectLike<boolean>;
    isBgmMutedRef: MutableRefObjectLike<boolean>;
    videoStartGateTokenRef: MutableRefObjectLike<number>;
    videoPlayTokenRef: MutableRefObjectLike<number>;
    transportIsStalledRef: MutableRefObjectLike<boolean>;
  };
  applyVideoTransportSnapshot: (
    snapshot: VideoSyncSnapshot,
    opts?: { playReason?: string; seekToleranceSec?: number }
  ) => Promise<boolean>;
  getVideoSyncMode: (fallback?: VideoSyncSnapshot['mode']) => VideoSyncSnapshot['mode'];
  getVideoTransportTimeSec: (fallbackTimeSec?: number) => number;
  setPlaybackBlockingState: (next: TransportBlockingState | null) => void;
  stopWebAudioVoice: () => void;
  stopAllSubtitleAudio: () => void;
  setIsVideoBuffering: (value: boolean) => void;
  setIsSubtitleBuffering: (value: boolean) => void;
  setIsPlaying: (value: boolean) => void;
  setIsSubtitleMuted: (value: boolean) => void;
  setIsBgmMuted: (value: boolean) => void;
  dispatchTransport: (action: EditorTransportAction) => void;
  abortAllVoiceInflight: () => void;
  locateBlockedClip: () => void;
  retryBlockedPlayback: () => void | Promise<void>;
};

export function createPlaybackBlockingOwner(args: CreatePlaybackBlockingOwnerArgs) {
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
    args.locateBlockedClip();
  };

  const handleRetryBlockedPlayback = () => {
    void args.retryBlockedPlayback();
  };

  return {
    handleCancelBlockedPlayback,
    handleLocateBlockedClip,
    handleRetryBlockedPlayback,
  };
}
