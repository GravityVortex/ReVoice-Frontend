import { describe, expect, it } from 'vitest';

import { getTimelineAutoFollowTarget } from './follow';

describe('getTimelineAutoFollowTarget', () => {
  it('does not auto-follow while the user is dragging the timeline', () => {
    expect(getTimelineAutoFollowTarget({
      currentTime: 8,
      prevTime: 7.8,
      pxPerSec: 120,
      scrollLeft: 300,
      viewportWidth: 1000,
      contentWidth: 4000,
      isDragging: true,
    })).toBeNull();
  });

  it('snaps near-center on large jumps', () => {
    expect(getTimelineAutoFollowTarget({
      currentTime: 18,
      prevTime: 2,
      pxPerSec: 100,
      scrollLeft: 0,
      viewportWidth: 900,
      contentWidth: 5000,
      isDragging: false,
    })).toEqual({
      mode: 'snap',
      targetLeft: 1485,
    });
  });

  it('eases when the playhead reaches the right trigger zone', () => {
    expect(getTimelineAutoFollowTarget({
      currentTime: 13,
      prevTime: 12.95,
      pxPerSec: 100,
      scrollLeft: 400,
      viewportWidth: 1000,
      contentWidth: 5000,
      isDragging: false,
    })).toEqual({
      mode: 'ease',
      targetLeft: 980,
    });
  });

  it('does nothing while the playhead stays inside the safe viewport zone', () => {
    expect(getTimelineAutoFollowTarget({
      currentTime: 9,
      prevTime: 8.95,
      pxPerSec: 100,
      scrollLeft: 400,
      viewportWidth: 1000,
      contentWidth: 5000,
      isDragging: false,
    })).toBeNull();
  });
});
