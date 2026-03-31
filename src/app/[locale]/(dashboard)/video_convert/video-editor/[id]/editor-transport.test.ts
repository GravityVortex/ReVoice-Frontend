import { describe, expect, it } from 'vitest';

import {
  auditionEndedNaturally,
  auditionReady,
  clearBlockingState,
  clearPendingNextClip,
  clearTransportBlockingState,
  createInitialTransportState,
  getActiveClipIndex,
  getAuditionStopAtSec,
  isAuditioning,
  pauseTimeline,
  playTimeline,
  resetTransport,
  seekTransport,
  setActiveClipIndex,
  setAutoPlayNext,
  setBlockingState,
  setTransportBlockingState,
  startConvertAudition,
  startSourceAudition,
  stopAudition,
  syncTransportTime,
  transportReducer,
} from './editor-transport';

describe('editor transport reducer', () => {
  it('starts without any blocking state', () => {
    expect(createInitialTransportState().blockingState).toBeNull();
  });

  it('stores and clears playback blocking state explicitly', () => {
    const blocked = transportReducer(
      createInitialTransportState(),
      setTransportBlockingState({
        kind: 'network_failed',
        clipIndex: 6,
        subtitleId: 'clip-6',
        retryCount: 3,
      })
    );

    expect(blocked.blockingState).toEqual({
      kind: 'network_failed',
      clipIndex: 6,
      subtitleId: 'clip-6',
      retryCount: 3,
    });

    const cleared = transportReducer(blocked, clearTransportBlockingState());
    expect(cleared.blockingState).toBeNull();
  });

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

  it('play_timeline is ignored while auditioning', () => {
    const base = transportReducer(
      createInitialTransportState(),
      startSourceAudition({ index: 0, timeSec: 0, stopAtSec: 5 })
    );
    const after = transportReducer(base, playTimeline());
    expect(after.mode).toBe('audition_source');
    expect(after.status).toBe('buffering');
  });

  it('pause_timeline is ignored while auditioning', () => {
    const base = transportReducer(
      transportReducer(
        createInitialTransportState(),
        startSourceAudition({ index: 0, timeSec: 0, stopAtSec: 5 })
      ),
      auditionReady()
    );
    const after = transportReducer(base, pauseTimeline());
    expect(after.mode).toBe('audition_source');
    expect(after.status).toBe('playing');
  });

  it('handles convert audition lifecycle', () => {
    const s0 = createInitialTransportState();
    const s1 = transportReducer(s0, startConvertAudition({ index: 1, timeSec: 5, stopAtSec: 8 }));
    expect(s1.mode).toBe('audition_convert');
    expect(s1.status).toBe('buffering');

    const s2 = transportReducer(s1, auditionReady());
    expect(s2.status).toBe('playing');

    const s3 = transportReducer(s2, stopAudition());
    expect(s3.mode).toBe('timeline');
    expect(s3.status).toBe('paused');
  });

  it('audition_ready is no-op when not auditioning', () => {
    const base = createInitialTransportState();
    const after = transportReducer(base, auditionReady());
    expect(after).toBe(base);
  });

  it('starting a new audition clears pending next clip', () => {
    const playing = transportReducer(
      transportReducer(
        createInitialTransportState({ autoPlayNext: true }),
        startSourceAudition({ index: 0, timeSec: 0, stopAtSec: 3 })
      ),
      auditionReady()
    );
    const ended = transportReducer(playing, auditionEndedNaturally());
    expect(ended.pendingNextClipIndex).toBe(1);

    const restarted = transportReducer(
      ended,
      startSourceAudition({ index: 5, timeSec: 10, stopAtSec: 12 })
    );
    expect(restarted.pendingNextClipIndex).toBeNull();
  });

  it('clear_pending_next_clip action works', () => {
    const state = createInitialTransportState({ pendingNextClipIndex: 3, pendingNextMode: 'source' } as any);
    const after = transportReducer(state, clearPendingNextClip());
    expect(after.pendingNextClipIndex).toBeNull();
    expect(after.pendingNextMode).toBeNull();
  });

  it('sync_transport_time and seek_transport update time', () => {
    const base = createInitialTransportState();
    const synced = transportReducer(base, syncTransportTime(42.5));
    expect(synced.transportTimeSec).toBe(42.5);

    const seeked = transportReducer(synced, seekTransport(10));
    expect(seeked.transportTimeSec).toBe(10);
  });

  it('set_active_clip_index updates clip index', () => {
    const base = createInitialTransportState();
    const after = transportReducer(base, setActiveClipIndex(7));
    expect(after.activeClipIndex).toBe(7);

    const cleared = transportReducer(after, setActiveClipIndex(null));
    expect(cleared.activeClipIndex).toBeNull();
  });

  it('set_auto_play_next toggles flag', () => {
    const base = createInitialTransportState();
    expect(base.autoPlayNext).toBe(false);

    const on = transportReducer(base, setAutoPlayNext(true));
    expect(on.autoPlayNext).toBe(true);

    const off = transportReducer(on, setAutoPlayNext(false));
    expect(off.autoPlayNext).toBe(false);
  });

  it('natural end without autoPlayNext does not schedule next', () => {
    const state = transportReducer(
      transportReducer(
        createInitialTransportState({ autoPlayNext: false }),
        startSourceAudition({ index: 2, timeSec: 12, stopAtSec: 15 })
      ),
      auditionReady()
    );
    const next = transportReducer(state, auditionEndedNaturally());
    expect(next.pendingNextClipIndex).toBeNull();
    expect(next.pendingNextMode).toBeNull();
  });

  it('natural end preserves correct pending mode for convert audition', () => {
    const state = transportReducer(
      transportReducer(
        createInitialTransportState({ autoPlayNext: true }),
        startConvertAudition({ index: 4, timeSec: 20, stopAtSec: 25 })
      ),
      auditionReady()
    );
    const next = transportReducer(state, auditionEndedNaturally());
    expect(next.pendingNextClipIndex).toBe(5);
    expect(next.pendingNextMode).toBe('convert');
  });

  it('play → pause → play round-trip', () => {
    const base = createInitialTransportState();
    const playing = transportReducer(base, playTimeline());
    expect(playing.status).toBe('playing');

    const paused = transportReducer(playing, pauseTimeline());
    expect(paused.status).toBe('paused');

    const resumed = transportReducer(paused, playTimeline());
    expect(resumed.status).toBe('playing');
  });

  it('resets owner state while preserving requested auto-play-next preference', () => {
    const active = transportReducer(
      transportReducer(
        createInitialTransportState({ autoPlayNext: false }),
        startConvertAudition({ index: 4, timeSec: 20, stopAtSec: 25 })
      ),
      setBlockingState({
        kind: 'network_failed',
        clipIndex: 4,
        subtitleId: 'clip-4',
        retryCount: 2,
      })
    );

    const reset = transportReducer(active, resetTransport({ autoPlayNext: true }));

    expect(reset).toEqual(
      createInitialTransportState({
        autoPlayNext: true,
      })
    );
  });

  it('unknown action returns same state reference', () => {
    const base = createInitialTransportState();
    const same = transportReducer(base, { type: 'unknown' } as any);
    expect(same).toBe(base);
  });

  it('can set and clear a blocking state', () => {
    const base = createInitialTransportState();
    const blocked = transportReducer(
      base,
      setBlockingState({
        kind: 'network_failed',
        clipIndex: 12,
        subtitleId: 'clip-12',
        retryCount: 3,
      })
    );
    expect(blocked.blockingState).toMatchObject({ kind: 'network_failed', clipIndex: 12, subtitleId: 'clip-12', retryCount: 3 });

    const cleared = transportReducer(blocked, clearBlockingState());
    expect(cleared.blockingState).toBeNull();
  });
});
