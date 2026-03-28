import { describe, expect, it } from 'vitest';

import { buildSubtitleTrackLayout } from './subtitle-track-layout';

function clip(id: string, startTime: number, duration: number) {
  return {
    id,
    type: 'video' as const,
    name: id,
    startTime,
    duration,
    text: id,
  };
}

describe('buildSubtitleTrackLayout', () => {
  it('sorts items by start time before computing layout entries', () => {
    const layout = buildSubtitleTrackLayout({
      items: [
        clip('b', 115.0, 0.04),
        clip('a', 114.84, 0.1),
        clip('c', 114.94, 0.06),
      ],
      totalDuration: 120,
      pxPerSec: 200,
    });

    expect(layout.entries.map((entry) => entry.item.id)).toEqual(['a', 'c', 'b']);
  });

  it('groups adjacent high-density clips into one dense run', () => {
    const layout = buildSubtitleTrackLayout({
      items: [
        clip('a', 114.84, 0.1),
        clip('b', 114.94, 0.06),
        clip('c', 115.0, 0.04),
      ],
      totalDuration: 120,
      pxPerSec: 50,
    });

    expect(layout.runs).toHaveLength(1);
    expect(layout.runs[0]).toMatchObject({
      mode: 'dense',
      itemIds: ['a', 'b', 'c'],
    });
    expect(layout.entries.map((entry) => entry.visualMode)).toEqual([
      'dense',
      'dense',
      'dense',
    ]);
  });

  it('keeps separated short clips as standalone compact runs when the gap is visible', () => {
    const layout = buildSubtitleTrackLayout({
      items: [
        clip('a', 1.0, 0.08),
        clip('b', 1.24, 0.08),
      ],
      totalDuration: 10,
      pxPerSec: 50,
    });

    expect(layout.runs.map((run) => ({ mode: run.mode, itemIds: run.itemIds }))).toEqual([
      { mode: 'compact', itemIds: ['a'] },
      { mode: 'compact', itemIds: ['b'] },
    ]);
  });

  it('keeps dense run boundaries aligned to true millisecond start times', () => {
    const layout = buildSubtitleTrackLayout({
      items: [
        clip('a', 114.84, 0.1),
        clip('b', 114.94, 0.06),
        clip('c', 115.0, 0.04),
      ],
      totalDuration: 120,
      pxPerSec: 50,
    });

    expect(layout.runs[0]?.boundaries.map((boundary) => ({
      itemId: boundary.itemId,
      startTime: boundary.startTime,
      leftPct: boundary.leftPct,
    }))).toEqual([
      {
        itemId: 'a',
        startTime: 114.84,
        leftPct: (114.84 / 120) * 100,
      },
      {
        itemId: 'b',
        startTime: 114.94,
        leftPct: (114.94 / 120) * 100,
      },
      {
        itemId: 'c',
        startTime: 115.0,
        leftPct: (115.0 / 120) * 100,
      },
    ]);
  });
});
