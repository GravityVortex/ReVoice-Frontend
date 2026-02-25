import { describe, expect, it } from 'vitest';

import { moveClipNoOverlap, TimelineClip } from './collision';

function clip(id: string, startTime: number, duration: number): TimelineClip {
  return { id, startTime, duration };
}

describe('moveClipNoOverlap', () => {
  it('clamps movement to avoid overlapping the next clip', () => {
    const clips = [clip('a', 0, 2), clip('b', 2.5, 1), clip('c', 4, 1)];
    const res = moveClipNoOverlap({
      clips,
      clipId: 'b',
      candidateStartTime: 3.6, // would overlap c (c starts at 4, b duration=1)
      mode: 'clamp',
    });

    const b = res.clips.find((x) => x.id === 'b')!;
    expect(b.startTime).toBe(3); // maxStart = 4 - 1
    expect(res.changedIds).toEqual(['b']);
    expect(res.clamped).toBe(true);
  });

  it('ripples (pushes) subsequent clips when overlapping', () => {
    const clips = [clip('a', 0, 2), clip('b', 2.5, 1), clip('c', 4, 1)];
    const res = moveClipNoOverlap({
      clips,
      clipId: 'b',
      candidateStartTime: 3.6,
      mode: 'ripple',
    });

    const b = res.clips.find((x) => x.id === 'b')!;
    const c = res.clips.find((x) => x.id === 'c')!;
    expect(b.startTime).toBe(3.6);
    expect(c.startTime).toBe(4.6); // pushed to b end
    expect(new Set(res.changedIds)).toEqual(new Set(['b', 'c']));
  });

  it('never allows the moved clip to cross into previous clip (both modes)', () => {
    const clips = [clip('a', 0, 2), clip('b', 2.5, 1), clip('c', 4, 1)];
    const resClamp = moveClipNoOverlap({
      clips,
      clipId: 'b',
      candidateStartTime: 0.8, // overlaps a
      mode: 'clamp',
    });
    const resRipple = moveClipNoOverlap({
      clips,
      clipId: 'b',
      candidateStartTime: 0.8,
      mode: 'ripple',
    });

    expect(resClamp.clips.find((x) => x.id === 'b')!.startTime).toBe(2); // prevEnd
    expect(resRipple.clips.find((x) => x.id === 'b')!.startTime).toBe(2); // prevEnd
  });
});

