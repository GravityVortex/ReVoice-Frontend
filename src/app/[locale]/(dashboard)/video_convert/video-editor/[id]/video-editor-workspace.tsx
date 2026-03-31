'use client';

import React from 'react';

import type { ConvertObj, SubtitleTrackItem } from '@/shared/components/video-editor/types';
import { ResizableSplitPanel } from '@/shared/components/resizable-split-panel';

import type { EditorTransportSnapshot } from './editor-transport';
import { SubtitleWorkstation, type SubtitleWorkstationHandle } from './subtitle-workstation';
import type { VideoEditorBoundDetailReloadAction } from './video-editor-reload-contract';
import { VideoPreviewPanel, type VideoPreviewRef } from './video-preview-panel';

type VideoEditorWorkspaceProps = {
  convertObj: ConvertObj | null;
  serverLastMergedAtMs: number;
  transportSnapshot: EditorTransportSnapshot;
  subtitleTrack: SubtitleTrackItem[];
  videoUrl?: string;
  workstationRef: React.RefObject<SubtitleWorkstationHandle | null>;
  videoPreviewRef: React.RefObject<VideoPreviewRef | null>;
  onSeekToSubtitle: (time: number) => void;
  onUpdateSubtitleAudioUrl: (id: string, audioUrl: string, previewAudioUrl?: string) => void;
  onSubtitleTextChange: (id: string, text: string) => void;
  onPreviewSubtitleCommit: (id: string, text: string) => boolean;
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
  onPreviewPlayStateChange: (isPlaying: boolean) => void;
  onRetryBlockedPlayback: () => void;
  onCancelBlockedPlayback: () => void;
  onLocateBlockedClip: () => void;
  onReloadFromServer: VideoEditorBoundDetailReloadAction;
};

export function VideoEditorWorkspace(props: VideoEditorWorkspaceProps) {
  return (
    <div className="bg-background/25 min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
      <ResizableSplitPanel
        className="h-full w-full"
        defaultLeftWidthPercent={58}
        minLeftWidthPercent={40}
        minRightWidthPercent={20}
        minRightWidthPx={320}
        leftPanel={
          <div className="bg-background/20 h-full">
            <SubtitleWorkstation
              ref={props.workstationRef}
              convertObj={props.convertObj}
              lastMergedAtMs={props.serverLastMergedAtMs}
              transportSnapshot={props.transportSnapshot}
              onSeekToSubtitle={props.onSeekToSubtitle}
              onUpdateSubtitleAudioUrl={props.onUpdateSubtitleAudioUrl}
              onSubtitleTextChange={props.onSubtitleTextChange}
              onSourceSubtitleTextChange={props.onSourceSubtitleTextChange}
              onSubtitleVoiceStatusChange={props.onSubtitleVoiceStatusChange}
              onPendingVoiceIdsChange={props.onPendingVoiceIdsChange}
              onPlaybackBlockedVoiceIdsChange={props.onPlaybackBlockedVoiceIdsChange}
              onVideoMergeStarted={props.onVideoMergeStarted}
              onRequestAuditionPlay={props.onRequestAuditionPlay}
              onRequestAuditionToggle={props.onRequestAuditionToggle}
              onRequestAuditionStop={props.onRequestAuditionStop}
              onToggleAutoPlayNext={props.onToggleAutoPlayNext}
              onDirtyStateChange={props.onDirtyStateChange}
              onResetTiming={props.onResetTiming}
              onReloadFromServer={props.onReloadFromServer}
            />
          </div>
        }
        rightPanel={
          <div className="h-full bg-black/95">
            <VideoPreviewPanel
              ref={props.videoPreviewRef}
              transportSnapshot={props.transportSnapshot}
              subtitleTrack={props.subtitleTrack}
              videoUrl={props.videoUrl}
              onPlayStateChange={props.onPreviewPlayStateChange}
              onRetryBlockedPlayback={props.onRetryBlockedPlayback}
              onCancelBlockedPlayback={props.onCancelBlockedPlayback}
              onLocateBlockedClip={props.onLocateBlockedClip}
              onSubtitleUpdate={props.onPreviewSubtitleCommit}
              className="rounded-none"
            />
          </div>
        }
      />
    </div>
  );
}
