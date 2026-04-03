import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TimelinePanel } from './timeline-panel';

vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => (key: string) => key,
}));

vi.mock('@/shared/components/ui/tooltip', () => ({
  Tooltip: ({ children }: Record<string, any>) => <div data-slot="tooltip">{children}</div>,
  TooltipTrigger: ({ children }: Record<string, any>) => <div data-slot="tooltip-trigger">{children}</div>,
  TooltipContent: ({ children }: Record<string, any>) => <div data-slot="tooltip-content">{children}</div>,
}));

describe('TimelinePanel', () => {
  it('does not keep the old edge-fade overlays in the timeline panel source', () => {
    const source = readFileSync(new URL('./timeline-panel.tsx', import.meta.url), 'utf8');

    expect(source).not.toContain('bg-gradient-to-r from-background/80 to-transparent');
    expect(source).not.toContain('bg-gradient-to-l from-background/80 to-transparent');
  });

  it('does not render a static horizontal-scroll edge fade over the timeline by default', () => {
    const html = renderToStaticMarkup(
      <TimelinePanel
        totalDuration={110}
        transportSnapshot={{
          currentTimeSec: 0,
          playbackStatus: 'paused',
          activeTimelineClipIndex: -1,
          activeAuditionClipIndex: null,
          auditionMode: null,
          autoPlayNext: false,
        }}
        subtitleTrack={[
          {
            id: 'clip-1',
            type: 'audio',
            name: 'clip-1',
            text: '第一条字幕',
            startTime: 0,
            duration: 12,
          },
          {
            id: 'clip-2',
            type: 'audio',
            name: 'clip-2',
            text: '第二条字幕',
            startTime: 24,
            duration: 10,
          },
        ]}
        zoom={1}
        volume={50}
        isBgmMuted={false}
        isSubtitleMuted={false}
        onPlayPause={() => {}}
        onSeek={() => {}}
        onZoomChange={() => {}}
        onVolumeChange={() => {}}
        onToggleBgmMute={() => {}}
        onToggleSubtitleMute={() => {}}
      />
    );

    expect(html).not.toContain('bg-gradient-to-r from-background/80 to-transparent');
    expect(html).not.toContain('bg-gradient-to-l from-background/80 to-transparent');
  });

  it('passes the real pxPerSec density into each subtitle track', () => {
    const source = readFileSync(new URL('./timeline-panel.tsx', import.meta.url), 'utf8');

    expect(source).toContain('pxPerSec={minPxPerSec}');
  });

  it('keeps the converted subtitle track read-only for timing edits', () => {
    const source = readFileSync(new URL('./timeline-panel.tsx', import.meta.url), 'utf8');

    expect(source).not.toContain('onItemsChange={onSubtitleTrackChange}');
    expect(source).not.toContain("timing.dragFeedback");
  });

  it('anchors a blocking label to the affected subtitle segment', () => {
    const html = renderToStaticMarkup(
      <TimelinePanel
        totalDuration={30}
        transportSnapshot={{
          currentTimeSec: 6,
          playbackStatus: 'paused',
          activeTimelineClipIndex: 1,
          activeAuditionClipIndex: null,
          auditionMode: null,
          autoPlayNext: false,
          blockingState: {
            kind: 'retrying',
            clipIndex: 1,
            subtitleId: 'clip-2',
            retryCount: 2,
          },
        }}
        subtitleTrack={[
          {
            id: 'clip-1',
            type: 'audio',
            name: 'clip-1',
            text: '第一条字幕',
            startTime: 0,
            duration: 3,
          },
          {
            id: 'clip-2',
            type: 'audio',
            name: 'clip-2',
            text: '第二条字幕',
            startTime: 5,
            duration: 4,
          },
        ]}
        zoom={1}
        volume={50}
        isBgmMuted={false}
        isSubtitleMuted={false}
        onPlayPause={() => {}}
        onSeek={() => {}}
        onZoomChange={() => {}}
        onVolumeChange={() => {}}
        onToggleBgmMute={() => {}}
        onToggleSubtitleMute={() => {}}
      />
    );

    expect(html).toContain('playbackGate.badge.retrying');
    expect(html).toContain('data-blocked-item-id="clip-2"');
    expect(html).toContain('data-blocked-state="retrying"');
  });

  it('uses injected split/undo tooltip text and respects undoDisabled from the shell owner', () => {
    const source = readFileSync(new URL('./timeline-panel.tsx', import.meta.url), 'utf8');
    const html = renderToStaticMarkup(
      <TimelinePanel
        totalDuration={30}
        transportSnapshot={{
          currentTimeSec: 6,
          playbackStatus: 'paused',
          activeTimelineClipIndex: -1,
          activeAuditionClipIndex: null,
          auditionMode: null,
          autoPlayNext: false,
          blockingState: null,
        }}
        subtitleTrack={[
          {
            id: 'clip-1',
            type: 'audio',
            name: 'clip-1',
            text: '第一条字幕',
            startTime: 0,
            duration: 8,
          },
        ]}
        zoom={1}
        volume={50}
        isBgmMuted={false}
        isSubtitleMuted={false}
        onPlayPause={() => {}}
        onSeek={() => {}}
        onZoomChange={() => {}}
        onVolumeChange={() => {}}
        onToggleBgmMute={() => {}}
        onToggleSubtitleMute={() => {}}
        onSplitAtCurrentTime={() => {}}
        structuralCapabilities={{
          blockReason: 'video-updating',
          split: {
            disabled: true,
            loading: false,
            tooltipText: '结构编辑暂时不可用',
          },
          undo: {
            available: true,
            disabled: true,
            loading: false,
            countdown: 0,
            tooltipText: '当前没有可撤销操作',
          },
        }}
        onUndo={() => {}}
      />
    );

    expect(source).toContain('structuralCapabilities?: VideoEditorStructuralCapabilities;');
    expect(source).toContain('const splitDisabled = structuralCapabilities?.split.disabled ?? false;');
    expect(source).toContain('const undoDisabled = structuralCapabilities?.undo.disabled ?? false;');
    expect(source).toContain("splitTooltipText || (splitDisabled ? t('toast.splitNoClip') : t('tooltips.splitSubtitleWithUndo'))");
    expect(source).toContain('undoTooltipText ||');
    expect(source).toContain('disabled={undoLoading || (undoCountdown === 0 && undoDisabled)}');
    expect(html.match(/disabled=""/g)).toHaveLength(2);
  });

  it('renders undo countdown as a cancel affordance while the rollback grace window is active', () => {
    const html = renderToStaticMarkup(
      <TimelinePanel
        totalDuration={30}
        transportSnapshot={{
          currentTimeSec: 6,
          playbackStatus: 'paused',
          activeTimelineClipIndex: -1,
          activeAuditionClipIndex: null,
          auditionMode: null,
          autoPlayNext: false,
          blockingState: null,
        }}
        subtitleTrack={[
          {
            id: 'clip-1',
            type: 'audio',
            name: 'clip-1',
            text: '第一条字幕',
            startTime: 0,
            duration: 8,
          },
        ]}
        zoom={1}
        volume={50}
        isBgmMuted={false}
        isSubtitleMuted={false}
        structuralCapabilities={{
          blockReason: null,
          split: {
            disabled: false,
            loading: false,
            tooltipText: null,
          },
          undo: {
            available: true,
            disabled: false,
            loading: false,
            countdown: 3,
            tooltipText: null,
          },
        }}
        onUndo={() => {}}
        onUndoCancel={() => {}}
        onPlayPause={() => {}}
        onSeek={() => {}}
        onZoomChange={() => {}}
        onVolumeChange={() => {}}
        onToggleBgmMute={() => {}}
        onToggleSubtitleMute={() => {}}
      />
    );

    expect(html).toContain('3s');
    expect(html).toContain('取消');
  });
});
