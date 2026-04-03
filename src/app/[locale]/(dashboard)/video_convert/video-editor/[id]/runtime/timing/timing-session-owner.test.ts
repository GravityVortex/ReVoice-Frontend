import { describe, expect, it } from 'vitest';

import {
  createInitialTimingSessionState,
  timingSessionReducer,
} from './timing-session-owner';

describe('timing session owner', () => {
  it('tracks timing persist phases explicitly', () => {
    const initialState = createInitialTimingSessionState();

    const autosavingState = timingSessionReducer(initialState, { type: 'autosave_start' });
    const failedState = timingSessionReducer(autosavingState, {
      type: 'persist_failed',
      errorMessage: 'save failed',
    });
    const persistingState = timingSessionReducer(failedState, { type: 'persist_start', reason: 'split' });
    const rollbackingState = timingSessionReducer(persistingState, { type: 'rollback_start' });

    expect(initialState.phase).toBe('idle');
    expect(autosavingState.phase).toBe('autosaving');
    expect(failedState.phase).toBe('save_failed');
    expect(failedState.lastPersistError).toBe('save failed');
    expect(persistingState.phase).toBe('persisting_for_split');
    expect(rollbackingState.phase).toBe('rollbacking');
  });

  it('stores latest remapped ids after persist success and resets on convert switch', () => {
    const initialState = createInitialTimingSessionState();
    const persistedState = timingSessionReducer(initialState, {
      type: 'persist_success',
      idMap: { 'clip-1': 'clip-1a' },
      persistedAtMs: 123,
    });
    const resetState = timingSessionReducer(persistedState, { type: 'reset_for_convert' });

    expect(persistedState.phase).toBe('idle');
    expect(persistedState.latestPersistIdMap).toEqual({ 'clip-1': 'clip-1a' });
    expect(persistedState.lastPersistedAtMs).toBe(123);
    expect(resetState.phase).toBe('idle');
    expect(resetState.latestPersistIdMap).toEqual({});
    expect(resetState.lastPersistedAtMs).toBe(0);
    expect(resetState.lastPersistError).toBeNull();
  });
});
