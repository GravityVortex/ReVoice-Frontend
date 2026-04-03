'use client';

import React from 'react';

import { ResizableSplitPanel } from '@/shared/components/resizable-split-panel';

import { SubtitleWorkstation } from './subtitle-workstation';
import { VideoPreviewPanel } from './video-preview-panel';
import type { VideoEditorWorkspaceCapabilities } from './video-editor-workspace-capabilities';

type VideoEditorWorkspaceProps = {
  workspaceCapabilities: VideoEditorWorkspaceCapabilities;
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
              ref={props.workspaceCapabilities.workstation.ref}
              convertObj={props.workspaceCapabilities.workstation.convertObj}
              lastMergedAtMs={props.workspaceCapabilities.workstation.lastMergedAtMs}
              transportSnapshot={props.workspaceCapabilities.workstation.transportSnapshot}
              onSeekToSubtitle={props.workspaceCapabilities.workstation.onSeekToSubtitle}
              onUpdateSubtitleAudioUrl={props.workspaceCapabilities.workstation.onUpdateSubtitleAudioUrl}
              onSubtitleTextChange={props.workspaceCapabilities.workstation.onSubtitleTextChange}
              onSourceSubtitleTextChange={props.workspaceCapabilities.workstation.onSourceSubtitleTextChange}
              onSubtitleVoiceStatusChange={props.workspaceCapabilities.workstation.onSubtitleVoiceStatusChange}
              onPendingVoiceIdsChange={props.workspaceCapabilities.workstation.onPendingVoiceIdsChange}
              onPlaybackBlockedVoiceIdsChange={props.workspaceCapabilities.workstation.onPlaybackBlockedVoiceIdsChange}
              onVideoMergeStarted={props.workspaceCapabilities.workstation.onVideoMergeStarted}
              onRequestAuditionPlay={props.workspaceCapabilities.workstation.onRequestAuditionPlay}
              onRequestAuditionToggle={props.workspaceCapabilities.workstation.onRequestAuditionToggle}
              onRequestAuditionStop={props.workspaceCapabilities.workstation.onRequestAuditionStop}
              onToggleAutoPlayNext={props.workspaceCapabilities.workstation.onToggleAutoPlayNext}
              onDirtyStateChange={props.workspaceCapabilities.workstation.onDirtyStateChange}
              onResetTiming={props.workspaceCapabilities.workstation.onResetTiming}
              onReloadFromServer={props.workspaceCapabilities.workstation.onReloadFromServer}
            />
          </div>
        }
        rightPanel={
          <div className="h-full bg-black/95">
            <VideoPreviewPanel
              ref={props.workspaceCapabilities.preview.ref}
              transportSnapshot={props.workspaceCapabilities.preview.transportSnapshot}
              subtitleTrack={props.workspaceCapabilities.preview.subtitleTrack}
              videoUrl={props.workspaceCapabilities.preview.videoUrl}
              onPlayStateChange={props.workspaceCapabilities.preview.onPlayStateChange}
              onRetryBlockedPlayback={props.workspaceCapabilities.preview.onRetryBlockedPlayback}
              onCancelBlockedPlayback={props.workspaceCapabilities.preview.onCancelBlockedPlayback}
              onLocateBlockedClip={props.workspaceCapabilities.preview.onLocateBlockedClip}
              onSubtitleUpdate={props.workspaceCapabilities.preview.onSubtitleUpdate}
              className="rounded-none"
            />
          </div>
        }
      />
    </div>
  );
}
