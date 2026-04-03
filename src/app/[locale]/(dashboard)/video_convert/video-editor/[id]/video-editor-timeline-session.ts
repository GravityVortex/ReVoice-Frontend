import type { PointerEventHandler, RefObject } from 'react';

import type { SubtitleTrackItem } from '@/shared/components/video-editor/types';

import type { EditorTransportSnapshot } from './editor-transport';
import type { TimelineHandle } from './timeline-panel';
import type { VideoEditorStructuralCapabilities } from './video-editor-structural-capabilities';

export type VideoEditorTimelineSession = {
  dock: {
    heightPx: number;
    resizeHandleLabel: string;
    onResizePointerDown: PointerEventHandler<HTMLDivElement>;
    onResizePointerMove: PointerEventHandler<HTMLDivElement>;
    onResizePointerUp: PointerEventHandler<HTMLDivElement>;
    onResizePointerCancel: PointerEventHandler<HTMLDivElement>;
  };
  panel: {
    totalDuration: number;
    transportSnapshot: EditorTransportSnapshot;
    subtitleTrack: SubtitleTrackItem[];
    subtitleTrackOriginal: SubtitleTrackItem[];
    vocalWaveformUrl?: string;
    bgmWaveformUrl?: string;
    timelineRef: RefObject<TimelineHandle | null>;
    zoom: number;
    volume: number;
    isBgmMuted: boolean;
    isSubtitleMuted: boolean;
    structuralCapabilities: VideoEditorStructuralCapabilities;
    onPlayPause: () => void;
    onSeek: (time: number, isDragging?: boolean) => void;
    onZoomChange: (zoom: number) => void;
    onVolumeChange: (volume: number) => void;
    onToggleBgmMute: () => void;
    onToggleSubtitleMute: () => void;
    onSplitAtCurrentTime: () => void;
    onUndo: () => void;
    onUndoCancel: () => void;
  };
};

export function buildVideoEditorTimelineSession(session: VideoEditorTimelineSession): VideoEditorTimelineSession {
  return session;
}
