import type { RefObject } from 'react';

import type { EditorTransportSnapshot } from './editor-transport';
import type { TimelineHandle } from './timeline-panel';
import type { VideoPreviewRef } from './video-preview-panel';

export type VideoEditorPlaybackSession = {
  state: {
    transportSnapshot: EditorTransportSnapshot;
    currentTime: number;
    totalDuration: number;
    volume: number;
    isBgmMuted: boolean;
    isSubtitleMuted: boolean;
    isPlaying: boolean;
  };
  refs: {
    timelineHandleRef: RefObject<TimelineHandle | null>;
    videoPreviewRef: RefObject<VideoPreviewRef | null>;
  };
  actions: {
    handlePreviewPlayStateChange: (isPlaying: boolean) => void;
    handlePlayPause: () => void;
    handleSeek: (time: number, isDragging?: boolean, isAuditionSeek?: boolean) => void;
    handleSeekToSubtitle: (time: number) => void;
    handleGlobalVolume: (vol: number) => void;
    handleToggleBgmMute: () => void;
    handleToggleSubtitleMute: () => void;
    handleAutoPlayNextChange: (value: boolean) => void;
    handleAuditionRequestPlay: (index: number, mode: 'source' | 'convert') => Promise<void>;
    handleAuditionToggle: () => void;
    handleAuditionStop: (naturalEnd?: boolean) => void;
    handleRetryBlockedPlayback: () => void;
    handleCancelBlockedPlayback: () => void;
    handleLocateBlockedClip: () => void;
  };
  maintenance: {
    clearVoiceCache: () => void;
    clearActiveTimelineClip: () => void;
  };
};

export function buildVideoEditorPlaybackSession(session: VideoEditorPlaybackSession): VideoEditorPlaybackSession {
  return session;
}
