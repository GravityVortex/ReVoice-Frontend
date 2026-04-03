import type { ActiveVideoMergeJob } from '../../video-merge-state';

export type MergeSessionPhase =
  | 'idle'
  | 'preparing'
  | 'requesting_merge'
  | 'polling_status'
  | 'manual_retry_required'
  | 'completed'
  | 'failed';

export type MergeSessionState = {
  phase: MergeSessionPhase;
  taskStatus: string;
  taskErrorMessage: string;
  taskProgress: number | null;
  taskCurrentStep: string;
  activeJob: ActiveVideoMergeJob | null;
  failureCount: number;
  lastMergedAtMs: number;
};

export type MergeSessionAction =
  | { type: 'reset_for_convert' }
  | { type: 'metadata_hydrated'; activeJob: ActiveVideoMergeJob | null; lastMergedAtMs: number }
  | {
      type: 'task_state_hydrated';
      taskStatus: string;
      taskErrorMessage: string;
      taskProgress: number | null;
      taskCurrentStep: string;
    }
  | { type: 'generate_started' }
  | { type: 'generate_cancelled' }
  | { type: 'merge_request_started' }
  | { type: 'merge_job_registered'; job: ActiveVideoMergeJob | null }
  | { type: 'status_poll_network_failed'; failureCount: number; requiresManualRetry: boolean }
  | { type: 'manual_retry_reset' }
  | { type: 'last_merged_at_updated'; lastMergedAtMs: number };

function mapTaskStatusToPhase(taskStatus: string): MergeSessionPhase | null {
  if (taskStatus === 'completed') return 'completed';
  if (taskStatus === 'failed') return 'failed';
  return null;
}

function resolveActivePhase(state: MergeSessionState): MergeSessionPhase {
  if (state.activeJob) {
    return state.phase === 'manual_retry_required' ? 'manual_retry_required' : 'polling_status';
  }

  const terminalPhase = mapTaskStatusToPhase(state.taskStatus);
  if (terminalPhase) return terminalPhase;

  if (state.phase === 'manual_retry_required') return 'idle';
  return state.phase;
}

export function createInitialMergeSessionState(): MergeSessionState {
  return {
    phase: 'idle',
    taskStatus: 'pending',
    taskErrorMessage: '',
    taskProgress: null,
    taskCurrentStep: '',
    activeJob: null,
    failureCount: 0,
    lastMergedAtMs: 0,
  };
}

const VALID_TRANSITIONS: Record<MergeSessionPhase, readonly MergeSessionPhase[]> = {
  idle: ['preparing', 'polling_status', 'completed', 'failed'],
  preparing: ['requesting_merge', 'idle'],
  requesting_merge: ['polling_status', 'idle'],
  polling_status: ['completed', 'failed', 'manual_retry_required', 'idle'],
  manual_retry_required: ['polling_status', 'idle'],
  completed: ['idle', 'preparing', 'polling_status'],
  failed: ['idle', 'preparing', 'polling_status'],
};

function warnInvalidTransition(from: MergeSessionPhase, to: MergeSessionPhase, actionType: string) {
  if (from === to) return;
  const allowed = VALID_TRANSITIONS[from];
  if (allowed && !allowed.includes(to)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(`[MergeSession] unexpected transition: ${from} → ${to} (action: ${actionType})`);
    }
  }
}

export function mergeSessionReducer(state: MergeSessionState, action: MergeSessionAction): MergeSessionState {
  const next = mergeSessionReducerInner(state, action);
  warnInvalidTransition(state.phase, next.phase, action.type);
  return next;
}

function mergeSessionReducerInner(state: MergeSessionState, action: MergeSessionAction): MergeSessionState {
  switch (action.type) {
    case 'reset_for_convert':
      return createInitialMergeSessionState();

    case 'metadata_hydrated': {
      const nextState: MergeSessionState = {
        ...state,
        activeJob: action.activeJob,
        lastMergedAtMs: Math.max(state.lastMergedAtMs, Math.max(0, action.lastMergedAtMs)),
      };
      return {
        ...nextState,
        phase: resolveActivePhase(nextState),
      };
    }

    case 'task_state_hydrated': {
      const nextState: MergeSessionState = {
        ...state,
        taskStatus: action.taskStatus,
        taskErrorMessage: action.taskErrorMessage,
        taskProgress: action.taskProgress,
        taskCurrentStep: action.taskCurrentStep,
      };

      const terminalPhase = mapTaskStatusToPhase(action.taskStatus);
      if (terminalPhase) {
        return {
          ...nextState,
          phase: terminalPhase,
          activeJob: null,
          failureCount: 0,
        };
      }

      return {
        ...nextState,
        phase: resolveActivePhase(nextState),
      };
    }

    case 'generate_started':
      return {
        ...state,
        phase: 'preparing',
      };

    case 'generate_cancelled': {
      const nextState = {
        ...state,
        failureCount: 0,
      };
      return {
        ...nextState,
        phase: state.activeJob ? resolveActivePhase(nextState) : 'idle',
      };
    }

    case 'merge_request_started':
      return {
        ...state,
        phase: 'requesting_merge',
        failureCount: 0,
      };

    case 'merge_job_registered': {
      const nextState = {
        ...state,
        activeJob: action.job,
        failureCount: 0,
      };
      return {
        ...nextState,
        phase: action.job ? 'polling_status' : resolveActivePhase(nextState),
      };
    }

    case 'status_poll_network_failed':
      return {
        ...state,
        failureCount: action.failureCount,
        phase: action.requiresManualRetry ? 'manual_retry_required' : 'polling_status',
      };

    case 'manual_retry_reset':
      return {
        ...state,
        failureCount: 0,
        phase: state.activeJob ? 'polling_status' : 'idle',
      };

    case 'last_merged_at_updated':
      return {
        ...state,
        lastMergedAtMs: Math.max(state.lastMergedAtMs, Math.max(0, action.lastMergedAtMs)),
      };

    default:
      return state;
  }
}
