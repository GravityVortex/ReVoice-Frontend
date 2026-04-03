import { describe, expect, it, vi } from 'vitest';

import { buildVideoEditorWorkspaceCapabilities } from './video-editor-workspace-capabilities';

describe('video editor workspace capabilities', () => {
  it('groups workstation and preview bindings into a single workspace protocol', () => {
    const capabilities = buildVideoEditorWorkspaceCapabilities({
      workstation: {
        ref: { current: null },
        convertObj: null,
        lastMergedAtMs: 123,
        transportSnapshot: {
          currentTimeSec: 0,
          playbackStatus: 'paused',
          activeTimelineClipIndex: -1,
          activeAuditionClipIndex: null,
          auditionMode: null,
          autoPlayNext: false,
        },
        onSeekToSubtitle: vi.fn(),
        onUpdateSubtitleAudioUrl: vi.fn(),
        onSubtitleTextChange: vi.fn(),
        onSourceSubtitleTextChange: vi.fn(),
        onSubtitleVoiceStatusChange: vi.fn(),
        onPendingVoiceIdsChange: vi.fn(),
        onPlaybackBlockedVoiceIdsChange: vi.fn(),
        onVideoMergeStarted: vi.fn(),
        onRequestAuditionPlay: vi.fn(),
        onRequestAuditionToggle: vi.fn(),
        onRequestAuditionStop: vi.fn(),
        onToggleAutoPlayNext: vi.fn(),
        onDirtyStateChange: vi.fn(),
        onResetTiming: vi.fn(),
        onReloadFromServer: vi.fn(),
      },
      preview: {
        ref: { current: null },
        transportSnapshot: {
          currentTimeSec: 0,
          playbackStatus: 'paused',
          activeTimelineClipIndex: -1,
          activeAuditionClipIndex: null,
          auditionMode: null,
          autoPlayNext: false,
        },
        subtitleTrack: [],
        videoUrl: 'demo.mp4',
        onPlayStateChange: vi.fn(),
        onRetryBlockedPlayback: vi.fn(),
        onCancelBlockedPlayback: vi.fn(),
        onLocateBlockedClip: vi.fn(),
        onSubtitleUpdate: vi.fn(),
      },
    });

    expect(capabilities.workstation.lastMergedAtMs).toBe(123);
    expect(capabilities.preview.videoUrl).toBe('demo.mp4');
    expect(capabilities.workstation.onVideoMergeStarted).toEqual(expect.any(Function));
    expect(capabilities.preview.onRetryBlockedPlayback).toEqual(expect.any(Function));
  });
});
