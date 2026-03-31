'use client';

import React from 'react';

import type { SubtitleTrackItem } from '@/shared/components/video-editor/types';
import { cn } from '@/shared/lib/utils';

import type { EditorTransportSnapshot } from './editor-transport';
import { TimelinePanel, type TimelineHandle } from './timeline-panel';

type VideoEditorTimelineDockProps = {
  locale: string;
  timelineHeightPx: number;
  resizeHandleLabel: string;
  totalDuration: number;
  transportSnapshot: EditorTransportSnapshot;
  subtitleTrack: SubtitleTrackItem[];
  subtitleTrackOriginal: SubtitleTrackItem[];
  vocalWaveformUrl?: string;
  bgmWaveformUrl?: string;
  timelineRef: React.RefObject<TimelineHandle | null>;
  zoom: number;
  volume: number;
  isBgmMuted: boolean;
  isSubtitleMuted: boolean;
  splitDisabled: boolean;
  splitTooltipText: string | null;
  splitLoading: boolean;
  hasUndoableOps: boolean;
  undoDisabled: boolean;
  undoLoading: boolean;
  undoCountdown: number;
  undoTooltipText: string | null;
  onResizePointerDown: React.PointerEventHandler<HTMLDivElement>;
  onResizePointerMove: React.PointerEventHandler<HTMLDivElement>;
  onResizePointerUp: React.PointerEventHandler<HTMLDivElement>;
  onResizePointerCancel: React.PointerEventHandler<HTMLDivElement>;
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

export function VideoEditorTimelineDock(props: VideoEditorTimelineDockProps) {
  return (
    <>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={props.resizeHandleLabel}
        className={cn(
          'group relative h-4 shrink-0 cursor-row-resize select-none',
          'rounded-md bg-white/[0.03] transition-colors hover:bg-white/5'
        )}
        onPointerDown={props.onResizePointerDown}
        onPointerMove={props.onResizePointerMove}
        onPointerUp={props.onResizePointerUp}
        onPointerCancel={props.onResizePointerCancel}
      >
        <div
          aria-hidden
          className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-white/10 transition-colors group-hover:bg-white/15"
        />
        <div
          aria-hidden
          className={cn(
            'absolute top-1/2 left-1/2 h-1.5 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-200',
            'group-hover:bg-primary/40 bg-white/15 group-hover:w-16'
          )}
        />
      </div>

      <div
        className="bg-background/25 min-h-[120px] overflow-auto rounded-xl border border-white/10 shadow-[0_18px_60px_rgba(0,0,0,0.35)]"
        style={{ height: `${props.timelineHeightPx}px` }}
      >
        <TimelinePanel
          totalDuration={props.totalDuration}
          transportSnapshot={props.transportSnapshot}
          subtitleTrack={props.subtitleTrack}
          subtitleTrackOriginal={props.subtitleTrackOriginal.length ? props.subtitleTrackOriginal : undefined}
          vocalWaveformUrl={props.vocalWaveformUrl}
          bgmWaveformUrl={props.bgmWaveformUrl}
          timelineRef={props.timelineRef}
          zoom={props.zoom}
          volume={props.volume}
          isBgmMuted={props.isBgmMuted}
          isSubtitleMuted={props.isSubtitleMuted}
          onPlayPause={props.onPlayPause}
          onSeek={props.onSeek}
          onZoomChange={props.onZoomChange}
          onVolumeChange={props.onVolumeChange}
          onToggleBgmMute={props.onToggleBgmMute}
          onToggleSubtitleMute={props.onToggleSubtitleMute}
          onSplitAtCurrentTime={props.onSplitAtCurrentTime}
          splitDisabled={props.splitDisabled}
          splitTooltipText={props.splitTooltipText}
          splitLoading={props.splitLoading}
          onUndo={props.hasUndoableOps ? props.onUndo : undefined}
          undoDisabled={props.undoDisabled}
          undoLoading={props.undoLoading}
          undoCountdown={props.undoCountdown}
          undoTooltipText={props.undoTooltipText}
          onUndoCancel={props.onUndoCancel}
        />
      </div>
    </>
  );
}
