import { describe, expect, it } from 'vitest';

import { getBufferedAheadSeconds, getBufferedEndForTime, type TimeRangesLike } from './media-buffer';

function makeRanges(ranges: Array<[number, number]>): TimeRangesLike {
  return {
    length: ranges.length,
    start(i) {
      return ranges[i][0];
    },
    end(i) {
      return ranges[i][1];
    },
  };
}

describe('media-buffer', () => {
  it('returns null when no buffered ranges exist', () => {
    const r = makeRanges([]);
    expect(getBufferedEndForTime(r, 0)).toBeNull();
    expect(getBufferedAheadSeconds(r, 0)).toBe(0);
  });

  it('computes buffered end/ahead for a single range', () => {
    const r = makeRanges([[0, 5]]);
    expect(getBufferedEndForTime(r, 0)).toBe(5);
    expect(getBufferedAheadSeconds(r, 0)).toBe(5);
    expect(getBufferedAheadSeconds(r, 0.5)).toBeCloseTo(4.5, 6);
    expect(getBufferedAheadSeconds(r, 5)).toBeCloseTo(0, 6);
  });

  it('returns 0 when time is in a gap', () => {
    const r = makeRanges([[0, 2], [4, 10]]);
    expect(getBufferedEndForTime(r, 3)).toBeNull();
    expect(getBufferedAheadSeconds(r, 3)).toBe(0);
  });

  it('selects the range that contains time when multiple ranges exist', () => {
    const r = makeRanges([[0, 2], [4, 10]]);
    expect(getBufferedEndForTime(r, 1)).toBe(2);
    expect(getBufferedEndForTime(r, 6)).toBe(10);
    expect(getBufferedAheadSeconds(r, 6)).toBeCloseTo(4, 6);
  });
});

