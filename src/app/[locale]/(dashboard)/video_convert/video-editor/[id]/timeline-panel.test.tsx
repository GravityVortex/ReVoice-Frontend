import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { TimelinePanel } from './timeline-panel';

vi.mock('next-intl', () => ({
  useLocale: () => 'zh',
  useTranslations: () => (key: string) => key,
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
});
