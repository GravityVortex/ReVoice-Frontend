import { describe, expect, it } from 'vitest';

import {
  auditionEndedNaturally,
  auditionReady,
  createInitialTransportState,
  getActiveClipIndex,
  getAuditionStopAtSec,
  isAuditioning,
  startSourceAudition,
  stopAudition,
  transportReducer,
} from './editor-transport';

describe('editor transport reducer', () => {
  it('moves from paused to buffering to playing in source audition mode', () => {
    const state0 = createInitialTransportState();
    const state1 = transportReducer(
      state0,
      startSourceAudition({ index: 3, timeSec: 12, stopAtSec: 15 })
    );
    const state2 = transportReducer(state1, auditionReady());

    expect(state1.mode).toBe('audition_source');
    expect(state1.status).toBe('buffering');
    expect(state2.status).toBe('playing');
    expect(isAuditioning(state2)).toBe(true);
    expect(getActiveClipIndex(state2)).toBe(3);
    expect(getAuditionStopAtSec(state2)).toBe(15);
  });

  it('schedules next clip only on natural end', () => {
    const state = transportReducer(
      transportReducer(
        createInitialTransportState({ autoPlayNext: true }),
        startSourceAudition({ index: 2, timeSec: 12, stopAtSec: 15 })
      ),
      auditionReady()
    );

    const next = transportReducer(state, auditionEndedNaturally());
    expect(next.pendingNextClipIndex).toBe(3);
  });

  it('does not schedule auto-play-next on manual stop', () => {
    const state = transportReducer(
      transportReducer(
        createInitialTransportState({ autoPlayNext: true }),
        startSourceAudition({ index: 2, timeSec: 12, stopAtSec: 15 })
      ),
      auditionReady()
    );

    const next = transportReducer(state, stopAudition());
    expect(next.pendingNextClipIndex).toBeNull();
    expect(next.status).toBe('paused');
    expect(isAuditioning(next)).toBe(false);
  });
});
