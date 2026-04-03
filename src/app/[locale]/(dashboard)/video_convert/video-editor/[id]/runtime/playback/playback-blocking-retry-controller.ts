import {
  pauseTimeline,
  playTimeline,
  stopAudition as stopTransportAudition,
  auditionReady as markAuditionReady,
  type TransportBlockingReason,
  type TransportBlockingState,
} from '../../editor-transport';
import type { VideoSyncSnapshot } from '../../video-sync-controller';

type SubtitleTrackItemLike = {
  id: string;
  startTime: number;
  duration: number;
  audioUrl?: string;
};

type VoiceUnavailableGate = {
  kind: 'voice_unavailable';
  clipIndex: number;
  subtitleId: string;
  reason: TransportBlockingReason;
};

type CreatePlaybackBlockingRetryControllerArgs = {
  getSubtitleTrack: () => SubtitleTrackItemLike[];
  getBlockingState: () => TransportBlockingState | null;
  getSubtitleBackend: () => 'webaudio' | 'media';
  getVideoSyncMode: (fallback?: VideoSyncSnapshot['mode']) => VideoSyncSnapshot['mode'];
  getVideoTransportTimeSec: (fallbackTimeSec?: number) => number;
  applyVideoTransportSnapshot: (
    snapshot: VideoSyncSnapshot,
    opts?: { playReason?: string; seekToleranceSec?: number }
  ) => Promise<boolean>;
  dispatchTransport: (action: ReturnType<typeof pauseTimeline> | ReturnType<typeof stopTransportAudition> | ReturnType<typeof playTimeline> | ReturnType<typeof markAuditionReady>) => void;
  setPlaybackBlockingState: (next: TransportBlockingState | null) => void;
  setIsVideoBuffering: (value: boolean) => void;
  setIsSubtitleBuffering: (value: boolean) => void;
  setIsPlaying: (value: boolean) => void;
  setPlayingSubtitleIndex: (value: number) => void;
  setTransportStalled: (value: boolean) => void;
  nextVideoPlayToken: () => number;
  stopWebAudioVoice: () => void;
  stopAllSubtitleAudio: () => void;
  pauseBgm: () => void;
  scrollToItem: (id: string) => void;
  seekToTime: (time: number) => void;
  evaluatePlaybackGateForClipIndex: (clipIndex: number) => { kind: 'ready' } | VoiceUnavailableGate;
  createVoiceUnavailableBlockingState: (gate: VoiceUnavailableGate) => TransportBlockingState;
};

type PlaybackStartFailureArgs = {
  mode: VideoSyncSnapshot['mode'];
  timeSec: number;
  preferredClipIndex?: number | null;
  subtitleId?: string;
  retryCount?: number;
};

export function createNetworkFailedBlockingState(clipIndex: number, subtitleId?: string, retryCount = 1): TransportBlockingState {
  return {
    kind: 'network_failed',
    clipIndex,
    subtitleId,
    retryCount,
  };
}

export function resolveRetryablePlaybackContext(
  track: SubtitleTrackItemLike[],
  timeSec: number,
  preferredClipIndex?: number | null,
  subtitleId?: string
) {
  let clipIndex =
    typeof preferredClipIndex === 'number' && preferredClipIndex >= 0 && preferredClipIndex < track.length ? preferredClipIndex : -1;

  if (clipIndex === -1 && subtitleId) {
    clipIndex = track.findIndex((item) => item.id === subtitleId);
  }

  if (clipIndex === -1) {
    clipIndex = track.findIndex((item) => timeSec >= item.startTime && timeSec < item.startTime + item.duration);
  }

  if (clipIndex === -1) {
    clipIndex = track.findIndex((item) => item.startTime >= timeSec);
  }

  const clip = clipIndex >= 0 ? track[clipIndex] ?? null : null;
  return {
    clipIndex,
    subtitleId: clip?.id ?? subtitleId,
  };
}

export function createPlaybackBlockingRetryController(args: CreatePlaybackBlockingRetryControllerArgs) {
  const resolveBlockingClipContext = (blockingState?: TransportBlockingState | null) => {
    if (!blockingState) return null;
    const track = args.getSubtitleTrack();
    let clipIndex = -1;
    if (blockingState.subtitleId) {
      clipIndex = track.findIndex((item) => item.id === blockingState.subtitleId);
    }
    if (clipIndex === -1 && blockingState.clipIndex >= 0 && blockingState.clipIndex < track.length) {
      clipIndex = blockingState.clipIndex;
    }
    const clip = clipIndex >= 0 ? track[clipIndex] ?? null : null;
    if (!clip) return null;
    return { blockingState, clipIndex, clip };
  };

  const handlePlaybackStartFailure = (payload: PlaybackStartFailureArgs) => {
    const retryContext = resolveRetryablePlaybackContext(
      args.getSubtitleTrack(),
      payload.timeSec,
      payload.preferredClipIndex,
      payload.subtitleId
    );
    args.setTransportStalled(false);
    args.setIsVideoBuffering(false);
    args.setIsSubtitleBuffering(false);
    args.setIsPlaying(false);
    args.setPlayingSubtitleIndex(retryContext.clipIndex);
    args.stopWebAudioVoice();
    args.stopAllSubtitleAudio();
    args.setPlaybackBlockingState(
      createNetworkFailedBlockingState(retryContext.clipIndex, retryContext.subtitleId, Math.max(1, payload.retryCount ?? 1))
    );

    if (payload.mode === 'timeline') {
      args.dispatchTransport(pauseTimeline());
      return;
    }

    args.dispatchTransport(stopTransportAudition());
  };

  const pausePlaybackForBlockingState = async (nextState: TransportBlockingState, pauseAtSec?: number) => {
    args.setPlaybackBlockingState(nextState);
    args.setIsVideoBuffering(false);
    args.setPlayingSubtitleIndex(nextState.clipIndex);
    args.nextVideoPlayToken();
    args.setTransportStalled(false);
    args.pauseBgm();
    args.stopWebAudioVoice();
    args.stopAllSubtitleAudio();
    args.setIsPlaying(false);
    args.setIsSubtitleBuffering(false);
    args.dispatchTransport(pauseTimeline());
    await args.applyVideoTransportSnapshot(
      {
        mode: args.getVideoSyncMode(),
        status: 'paused',
        transportTimeSec: Number.isFinite(pauseAtSec) ? Math.max(0, pauseAtSec || 0) : args.getVideoTransportTimeSec(),
      },
      {
        seekToleranceSec: 0,
      }
    );
  };

  const pausePlaybackForMediaFailure = (clipIndex: number, clip?: { id?: string; startTime?: number } | null) => {
    if (!clip) return;
    const activeBlocking = args.getBlockingState();
    if (activeBlocking?.kind === 'network_failed' && activeBlocking.subtitleId === clip.id) return;
    void pausePlaybackForBlockingState(createNetworkFailedBlockingState(clipIndex, clip.id), clip.startTime);
  };

  const handleLocateBlockedClip = () => {
    const resolved = resolveBlockingClipContext(args.getBlockingState());
    if (!resolved) return;
    args.scrollToItem(resolved.clip.id);
    args.seekToTime(resolved.clip.startTime);
  };

  const handleRetryBlockedPlayback = async () => {
    const blockingState = args.getBlockingState();
    if (!blockingState) return;
    const resolved = resolveBlockingClipContext(blockingState);

    if (!resolved && blockingState.kind !== 'network_failed') return;

    // Medium Fix #7: Reload convertDetail before retry to get latest gate state
    if (resolved) {
      const gate = args.evaluatePlaybackGateForClipIndex(resolved.clipIndex);
      if (gate.kind === 'voice_unavailable') {
        args.setPlayingSubtitleIndex(resolved.clipIndex);
        await pausePlaybackForBlockingState(args.createVoiceUnavailableBlockingState(gate), resolved.clip.startTime);
        return;
      }
    }

    if (blockingState.kind === 'network_failed') {
      const retryCount = Math.max(1, Number(blockingState.retryCount || 0) + 1);
      const nextMode = args.getVideoSyncMode();
      const fallbackTimeSec = args.getVideoTransportTimeSec();
      const retryContext = resolveRetryablePlaybackContext(
        args.getSubtitleTrack(),
        fallbackTimeSec,
        resolved?.clipIndex ?? blockingState.clipIndex,
        resolved?.clip.id ?? blockingState.subtitleId
      );

      if (args.getSubtitleBackend() === 'media' || !resolved) {
        const retryClipIndex = retryContext.clipIndex;
        const retrySubtitleId = retryContext.subtitleId;
        const retryStartTimeSec = resolved?.clip.startTime ?? fallbackTimeSec;
        args.setPlayingSubtitleIndex(retryClipIndex);
        args.setPlaybackBlockingState({
          kind: 'retrying',
          clipIndex: retryClipIndex,
          subtitleId: retrySubtitleId,
          retryCount,
        });
        args.stopWebAudioVoice();
        args.stopAllSubtitleAudio();

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
          handlePlaybackStartFailure({
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
        return;
      }
    }

    if (!resolved) return;

    const gate = args.evaluatePlaybackGateForClipIndex(resolved.clipIndex);
    if (gate.kind === 'voice_unavailable') {
      args.setPlayingSubtitleIndex(resolved.clipIndex);
      await pausePlaybackForBlockingState(args.createVoiceUnavailableBlockingState(gate), resolved.clip.startTime);
    }
  };

  return {
    createNetworkFailedBlockingState,
    resolveRetryablePlaybackContext: (timeSec: number, preferredClipIndex?: number | null, subtitleId?: string) =>
      resolveRetryablePlaybackContext(args.getSubtitleTrack(), timeSec, preferredClipIndex, subtitleId),
    resolveBlockingClipContext,
    handlePlaybackStartFailure,
    pausePlaybackForBlockingState,
    pausePlaybackForMediaFailure,
    handleLocateBlockedClip,
    handleRetryBlockedPlayback,
  };
}
