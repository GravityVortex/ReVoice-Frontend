import { describe, expect, it } from 'vitest';

import {
  MERGE_STATUS_MAX_NETWORK_FAILURES,
  reconcileMergeTerminalState,
  getNextMergeStatusPollState,
  getVideoMergePrimaryActionState,
  readVideoMergeMetadata,
  shouldPollActiveVideoMergeStatus,
} from './video-merge-state';

describe('video merge state', () => {
  it('reads last successful merge timestamp and active pending job from metadata', () => {
    expect(
      readVideoMergeMetadata(
        JSON.stringify({
          videoMerge: {
            lastSuccess: {
              mergedAtMs: 1710000000000,
            },
            active: {
              jobId: 'job-1',
              createdAtMs: 1710000001234,
              state: 'pending',
            },
          },
        })
      )
    ).toEqual({
      lastMergedAtMs: 1710000000000,
      activeJob: {
        jobId: 'job-1',
        createdAtMs: 1710000001234,
      },
    });
  });

  it('ignores non-pending active jobs when restoring merge polling state', () => {
    expect(
      readVideoMergeMetadata({
        video_merge: {
          last_merged_at_ms: '1710000000000',
          active: {
            job_id: 'job-2',
            created_at_ms: '1710000001234',
            state: 'success',
          },
        },
      })
    ).toEqual({
      lastMergedAtMs: 1710000000000,
      activeJob: null,
    });
  });

  it('ignores active jobs without a valid createdAtMs so refresh recovery never fabricates a merge baseline', () => {
    expect(
      readVideoMergeMetadata({
        videoMerge: {
          lastSuccess: {
            mergedAtMs: 1710000000000,
          },
          active: {
            jobId: 'job-3',
            state: 'pending',
          },
        },
      })
    ).toEqual({
      lastMergedAtMs: 1710000000000,
      activeJob: null,
    });
  });

  it('enters manual retry mode after the configured number of consecutive network failures', () => {
    let failureCount = 0;

    for (let i = 0; i < MERGE_STATUS_MAX_NETWORK_FAILURES - 1; i += 1) {
      const next = getNextMergeStatusPollState(failureCount);
      failureCount = next.failureCount;
      expect(next.requiresManualRetry).toBe(false);
    }

    expect(getNextMergeStatusPollState(failureCount)).toEqual({
      failureCount: MERGE_STATUS_MAX_NETWORK_FAILURES,
      requiresManualRetry: true,
    });
  });

  it('stops polling while a merge job is waiting for manual status retry', () => {
    expect(shouldPollActiveVideoMergeStatus({ jobId: 'job-3', createdAtMs: 1710000001234 }, true)).toBe(false);
    expect(shouldPollActiveVideoMergeStatus({ jobId: 'job-3', createdAtMs: 1710000001234 }, false)).toBe(true);
    expect(shouldPollActiveVideoMergeStatus(null, false)).toBe(false);
  });

  it('turns the primary header action into a retry entry instead of keeping it locked', () => {
    expect(
      getVideoMergePrimaryActionState({
        isGeneratingVideo: false,
        isTaskRunning: true,
        isMergeJobActive: true,
        mergeStatusRequiresManualRetry: true,
        hasUnsavedChanges: false,
      })
    ).toEqual({
      mode: 'retry-status',
      disabled: false,
    });
  });

  it('keeps the generate action disabled while an active merge is still being confirmed', () => {
    expect(
      getVideoMergePrimaryActionState({
        isGeneratingVideo: false,
        isTaskRunning: true,
        isMergeJobActive: true,
        mergeStatusRequiresManualRetry: false,
        hasUnsavedChanges: true,
      })
    ).toEqual({
      mode: 'generate-video',
      disabled: true,
    });
  });

  it('clears merge lock state once the task reaches a terminal status from bootstrap or progress polling', () => {
    expect(
      reconcileMergeTerminalState({
        taskStatus: 'completed',
        activeJob: { jobId: 'job-1', createdAtMs: 1710000001234 },
        requiresManualRetry: true,
        failureCount: 3,
      })
    ).toEqual({
      activeJob: null,
      requiresManualRetry: false,
      failureCount: 0,
    });

    expect(
      reconcileMergeTerminalState({
        taskStatus: 'processing',
        activeJob: { jobId: 'job-2', createdAtMs: 1710000002234 },
        requiresManualRetry: true,
        failureCount: 2,
      })
    ).toEqual({
      activeJob: { jobId: 'job-2', createdAtMs: 1710000002234 },
      requiresManualRetry: true,
      failureCount: 2,
    });
  });
});
