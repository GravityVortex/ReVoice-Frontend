import { describe, expect, it } from 'vitest';

import { findNextSubtitleIndexAtOrAfterTime, findSubtitleIndexAtTime } from './playback-time-loop';

describe('playback time loop helpers', () => {
  const track = [
    { id: 'a', startTime: 0, duration: 1 },
    { id: 'b', startTime: 2, duration: 1.5 },
    { id: 'c', startTime: 5, duration: 1 },
  ];

  it('finds the active subtitle index only when transport time is inside the subtitle range', () => {
    expect(findSubtitleIndexAtTime(track, 0.4)).toBe(0);
    expect(findSubtitleIndexAtTime(track, 1.4)).toBe(-1);
    expect(findSubtitleIndexAtTime(track, 2.2)).toBe(1);
  });

  it('finds the next subtitle index when transport time falls into a gap', () => {
    expect(findNextSubtitleIndexAtOrAfterTime(track, 1.4)).toBe(1);
    expect(findNextSubtitleIndexAtOrAfterTime(track, 5.1)).toBe(-1);
  });
});
