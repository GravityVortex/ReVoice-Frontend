export type TimingPersistReason = 'autosave' | 'split' | 'merge' | 'manual';

export type TimingSessionPhase =
  | 'idle'
  | 'autosaving'
  | 'save_failed'
  | 'persisting_for_split'
  | 'persisting_for_merge'
  | 'persisting_manual'
  | 'rollbacking';

export type TimingSessionState = {
  phase: TimingSessionPhase;
  latestPersistIdMap: Record<string, string>;
  lastPersistError: string | null;
  lastPersistedAtMs: number;
};

export type TimingSessionAction =
  | { type: 'autosave_start' }
  | { type: 'persist_start'; reason: Exclude<TimingPersistReason, 'autosave'> }
  | { type: 'persist_success'; idMap: Record<string, string>; persistedAtMs: number }
  | { type: 'persist_failed'; errorMessage: string }
  | { type: 'rollback_start' }
  | { type: 'rollback_finish' }
  | { type: 'reset_for_convert' };

function getPersistingPhase(reason: Exclude<TimingPersistReason, 'autosave'>): TimingSessionPhase {
  if (reason === 'split') return 'persisting_for_split';
  if (reason === 'merge') return 'persisting_for_merge';
  return 'persisting_manual';
}

export function createInitialTimingSessionState(): TimingSessionState {
  return {
    phase: 'idle',
    latestPersistIdMap: {},
    lastPersistError: null,
    lastPersistedAtMs: 0,
  };
}

export function timingSessionReducer(state: TimingSessionState, action: TimingSessionAction): TimingSessionState {
  switch (action.type) {
    case 'autosave_start':
      return {
        ...state,
        phase: 'autosaving',
        lastPersistError: null,
      };

    case 'persist_start':
      return {
        ...state,
        phase: getPersistingPhase(action.reason),
        lastPersistError: null,
      };

    case 'persist_success':
      return {
        ...state,
        phase: 'idle',
        latestPersistIdMap: action.idMap,
        lastPersistError: null,
        lastPersistedAtMs: action.persistedAtMs,
      };

    case 'persist_failed':
      return {
        ...state,
        phase: 'save_failed',
        lastPersistError: action.errorMessage,
      };

    case 'rollback_start':
      return {
        ...state,
        phase: 'rollbacking',
      };

    case 'rollback_finish':
      return {
        ...state,
        phase: 'idle',
      };

    case 'reset_for_convert':
      return createInitialTimingSessionState();

    default:
      return state;
  }
}
