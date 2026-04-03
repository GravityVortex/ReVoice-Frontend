import { describe, expect, it, vi } from 'vitest';

import { buildVideoEditorTimelineSession } from './video-editor-timeline-session';

describe('video editor timeline session', () => {
  it('groups dock layout, media state, and timeline actions into one shell protocol', () => {
    const session = buildVideoEditorTimelineSession({
      dock: {
        heightPx: 320,
        resizeHandleLabel: 'resize timeline',
        onResizePointerDown: vi.fn(),
        onResizePointerMove: vi.fn(),
        onResizePointerUp: vi.fn(),
        onResizePointerCancel: vi.fn(),
      },
      panel: {
        totalDuration: 120,
        transportSnapshot: {
          currentTimeSec: 0,
          playbackStatus: 'paused',
          activeTimelineClipIndex: -1,
          activeAuditionClipIndex: null,
          auditionMode: null,
          autoPlayNext: false,
        },
        subtitleTrack: [],
        subtitleTrackOriginal: [],
        vocalWaveformUrl: 'vocal.wav',
        bgmWaveformUrl: 'bgm.wav',
        timelineRef: { current: null },
        zoom: 1,
        volume: 50,
        isBgmMuted: false,
        isSubtitleMuted: false,
        structuralCapabilities: {
          blockReason: null,
          split: { disabled: false, loading: false, tooltipText: null },
          undo: { available: false, disabled: false, loading: false, countdown: 0, tooltipText: null },
        },
        onPlayPause: vi.fn(),
        onSeek: vi.fn(),
        onZoomChange: vi.fn(),
        onVolumeChange: vi.fn(),
        onToggleBgmMute: vi.fn(),
        onToggleSubtitleMute: vi.fn(),
        onSplitAtCurrentTime: vi.fn(),
        onUndo: vi.fn(),
        onUndoCancel: vi.fn(),
      },
    });

    expect(session.dock.heightPx).toBe(320);
    expect(session.panel.totalDuration).toBe(120);
    expect(session.panel.structuralCapabilities.undo.available).toBe(false);
    expect(session.panel.onPlayPause).toEqual(expect.any(Function));
  });
});
