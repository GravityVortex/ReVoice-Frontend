import type { RefObject } from 'react';

import type { ConvertObj, SubtitleTrackItem } from '@/shared/components/video-editor/types';

import type { EditorTransportSnapshot } from './editor-transport';
import type { SubtitleWorkstationHandle } from './subtitle-workstation';
import type { VideoEditorBoundDetailReloadAction } from './video-editor-reload-contract';
import type { VideoPreviewRef } from './video-preview-panel';

export type VideoEditorWorkspaceCapabilities = {
  workstation: {
    ref: RefObject<SubtitleWorkstationHandle | null>;
    convertObj: ConvertObj | null;
    lastMergedAtMs: number;
    transportSnapshot: EditorTransportSnapshot;
    onSeekToSubtitle: (time: number) => void;
    onUpdateSubtitleAudioUrl: (id: string, audioUrl: string, previewAudioUrl?: string) => void;
    onSubtitleTextChange: (id: string, text: string) => void;
    onSourceSubtitleTextChange: (sourceId: string, text: string) => void;
    onSubtitleVoiceStatusChange: (id: string, voiceStatus: string, needsTts: boolean) => void;
    onPendingVoiceIdsChange: (ids: Array<{ id: string; updatedAtMs: number }>) => void;
    onPlaybackBlockedVoiceIdsChange: (ids: string[]) => void;
    onVideoMergeStarted: (args: { jobId: string; createdAtMs: number }) => void;
    onRequestAuditionPlay: (index: number, mode: 'source' | 'convert') => void;
    onRequestAuditionToggle: () => void;
    onRequestAuditionStop: () => void;
    onToggleAutoPlayNext: (val: boolean) => void;
    onDirtyStateChange: (isDirty: boolean) => void;
    onResetTiming: (id: string, sourceId: string, startMs: number, endMs: number) => void;
    onReloadFromServer: VideoEditorBoundDetailReloadAction;
  };
  preview: {
    ref: RefObject<VideoPreviewRef | null>;
    transportSnapshot: EditorTransportSnapshot;
    subtitleTrack: SubtitleTrackItem[];
    videoUrl?: string;
    onPlayStateChange: (isPlaying: boolean) => void;
    onRetryBlockedPlayback: () => void;
    onCancelBlockedPlayback: () => void;
    onLocateBlockedClip: () => void;
    onSubtitleUpdate: (id: string, text: string) => boolean;
  };
};

export function buildVideoEditorWorkspaceCapabilities(
  capabilities: VideoEditorWorkspaceCapabilities
): VideoEditorWorkspaceCapabilities {
  return capabilities;
}
