'use client';

import React from 'react';

import { cn } from '@/shared/lib/utils';

import { TimelinePanel } from './timeline-panel';
import type { VideoEditorTimelineSession } from './video-editor-timeline-session';

type VideoEditorTimelineDockProps = {
  timelineSession: VideoEditorTimelineSession;
};

export function VideoEditorTimelineDock(props: VideoEditorTimelineDockProps) {
  return (
    <>
      <div
        role="separator"
        aria-orientation="horizontal"
        aria-label={props.timelineSession.dock.resizeHandleLabel}
        className={cn(
          'group relative h-4 shrink-0 cursor-row-resize select-none',
          'rounded-md bg-white/[0.03] transition-colors hover:bg-white/5'
        )}
        onPointerDown={props.timelineSession.dock.onResizePointerDown}
        onPointerMove={props.timelineSession.dock.onResizePointerMove}
        onPointerUp={props.timelineSession.dock.onResizePointerUp}
        onPointerCancel={props.timelineSession.dock.onResizePointerCancel}
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
        style={{ height: `${props.timelineSession.dock.heightPx}px` }}
      >
        <TimelinePanel
          totalDuration={props.timelineSession.panel.totalDuration}
          transportSnapshot={props.timelineSession.panel.transportSnapshot}
          subtitleTrack={props.timelineSession.panel.subtitleTrack}
          subtitleTrackOriginal={
            props.timelineSession.panel.subtitleTrackOriginal.length ? props.timelineSession.panel.subtitleTrackOriginal : undefined
          }
          vocalWaveformUrl={props.timelineSession.panel.vocalWaveformUrl}
          bgmWaveformUrl={props.timelineSession.panel.bgmWaveformUrl}
          timelineRef={props.timelineSession.panel.timelineRef}
          zoom={props.timelineSession.panel.zoom}
          volume={props.timelineSession.panel.volume}
          isBgmMuted={props.timelineSession.panel.isBgmMuted}
          isSubtitleMuted={props.timelineSession.panel.isSubtitleMuted}
          onPlayPause={props.timelineSession.panel.onPlayPause}
          onSeek={props.timelineSession.panel.onSeek}
          onZoomChange={props.timelineSession.panel.onZoomChange}
          onVolumeChange={props.timelineSession.panel.onVolumeChange}
          onToggleBgmMute={props.timelineSession.panel.onToggleBgmMute}
          onToggleSubtitleMute={props.timelineSession.panel.onToggleSubtitleMute}
          onSplitAtCurrentTime={props.timelineSession.panel.onSplitAtCurrentTime}
          structuralCapabilities={props.timelineSession.panel.structuralCapabilities}
          onUndo={props.timelineSession.panel.structuralCapabilities.undo.available ? props.timelineSession.panel.onUndo : undefined}
          onUndoCancel={props.timelineSession.panel.onUndoCancel}
        />
      </div>
    </>
  );
}
