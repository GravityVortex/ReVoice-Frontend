import { describe, expect, it } from 'vitest';

import {
  createInitialMergeSessionState,
  mergeSessionReducer,
} from './merge-session-owner';

describe('merge session owner', () => {
  it('transitions from request to polling to manual retry after repeated network failures', () => {
    const initialState = createInitialMergeSessionState();
    const preparingState = mergeSessionReducer(initialState, { type: 'generate_started' });
    const requestingState = mergeSessionReducer(preparingState, { type: 'merge_request_started' });
    const pollingState = mergeSessionReducer(requestingState, {
      type: 'merge_job_registered',
      job: {
        jobId: 'job-1',
        createdAtMs: 123,
      },
    });
    const retryState = mergeSessionReducer(pollingState, {
      type: 'status_poll_network_failed',
      failureCount: 3,
      requiresManualRetry: true,
    });

    expect(preparingState.phase).toBe('preparing');
    expect(requestingState.phase).toBe('requesting_merge');
    expect(pollingState.phase).toBe('polling_status');
    expect(retryState.phase).toBe('manual_retry_required');
    expect(retryState.failureCount).toBe(3);
    expect(retryState.activeJob).toEqual({
      jobId: 'job-1',
      createdAtMs: 123,
    });
  });

  it('hydrates task detail and clears active job once the task becomes terminal', () => {
    const initialState = createInitialMergeSessionState();
    const pollingState = mergeSessionReducer(initialState, {
      type: 'merge_job_registered',
      job: {
        jobId: 'job-2',
        createdAtMs: 456,
      },
    });
    const completedState = mergeSessionReducer(pollingState, {
      type: 'task_state_hydrated',
      taskStatus: 'completed',
      taskErrorMessage: '',
      taskProgress: 100,
      taskCurrentStep: '',
    });

    expect(completedState.phase).toBe('completed');
    expect(completedState.taskStatus).toBe('completed');
    expect(completedState.activeJob).toBeNull();
    expect(completedState.failureCount).toBe(0);
  });
});
