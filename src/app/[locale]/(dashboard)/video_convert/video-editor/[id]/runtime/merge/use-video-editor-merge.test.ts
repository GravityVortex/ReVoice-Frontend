import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  getNextMergeStatusPollState,
  hydrateVideoMergeMetadataState,
  resolveVideoMergeStatusResponse,
} from '../../video-merge-state';

describe('use video editor merge helpers', () => {
  const shellSource = readFileSync(new URL('../../video-editor-page-shell.tsx', import.meta.url), 'utf8');
  const gateSource = readFileSync(new URL('../orchestration/video-editor-page-gates.ts', import.meta.url), 'utf8');

  it('lets the page shell delegate merge owner state to useVideoEditorMerge', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-merge.ts', import.meta.url), 'utf8');

    expect(shellSource).toContain("import { useVideoEditorMerge } from './runtime/merge/use-video-editor-merge';");
    expect(shellSource).toContain('} = useVideoEditorMerge({');
    expect(shellSource).not.toContain("const [taskStatus, setTaskStatus] = useState<string>('pending');");
    expect(shellSource).not.toContain('const [serverActiveMergeJob, setServerActiveMergeJob] = useState<ActiveVideoMergeJob | null>(null);');
    expect(shellSource).not.toContain('const [mergeStatusRequiresManualRetry, setMergeStatusRequiresManualRetry] = useState(false);');
    expect(shellSource).not.toContain('const handleRetryMergeStatus = useCallback(() => {');
    expect(shellSource).not.toContain('const handleGenerateVideo = useCallback(async () => {');
    expect(shellSource).toContain('const pageGateState = useMemo(');
    expect(shellSource).toContain('headerDownloadTooltipKey: pageGateState.header.downloadState.tooltipKey,');

    expect(hookSource).toContain("import { buildVideoEditorMergeSession } from './video-editor-merge-session';");
    expect(hookSource).toContain("import { createInitialMergeSessionState, mergeSessionReducer } from './merge-session-owner';");
    expect(hookSource).toContain('const [mergeState, dispatchMerge] = useReducer(');
    expect(hookSource).toContain('const handleRetryMergeStatus = useCallback(() => {');
    expect(hookSource).toContain('const handleGenerateVideo = useCallback(async () => {');
    expect(hookSource).not.toContain('const mergePrimaryAction = useMemo(');
    expect(hookSource).not.toContain('const showHeaderBusySpinner =');
    expect(hookSource).not.toContain('const headerDownloadState = useMemo(');
    expect(hookSource).toContain('downloadGuardRef');
    expect(hookSource).not.toContain('getHeaderDownloadState({');
    expect(gateSource).toContain('getVideoMergePrimaryActionState({');
    expect(gateSource).not.toContain('getHeaderDownloadState({');
    expect(shellSource).toContain('getHeaderDownloadState({');
  });

  it('guards the async generate-video chain by active convert task so stale clicks cannot rewrite the next task', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-merge.ts', import.meta.url), 'utf8');

    expect(hookSource).toContain('const activeConvertIdRef = useRef(convertId);');
    expect(hookSource).toContain('activeConvertIdRef.current = convertId;');
    expect(hookSource).toContain('const taskId = convertId;');
    expect(hookSource).toContain('if (activeConvertIdRef.current !== taskId) return;');
    expect(hookSource).toContain('if (!readyForMerge) {');
    expect(hookSource).toContain('if (!timingReady) {');
    expect(hookSource).toContain('if (activeConvertIdRef.current !== taskId) return;');
    expect(hookSource).toContain("dispatchMerge({ type: 'generate_started' });");
    expect(hookSource).toContain("dispatchMerge({ type: 'generate_cancelled' });");
    expect(hookSource).toContain("type: 'task_state_hydrated'");
  });

  it('hydrates metadata monotonically so stale metadata never rewinds the merge baseline', () => {
    expect(
      hydrateVideoMergeMetadataState({
        previousLastMergedAtMs: 500,
        metadata: {
          videoMerge: {
            lastSuccess: {
              mergedAtMs: 300,
            },
            active: {
              jobId: 'job-1',
              createdAtMs: 123,
              state: 'pending',
            },
          },
        },
      })
    ).toEqual({
      lastMergedAtMs: 500,
      activeJob: {
        jobId: 'job-1',
        createdAtMs: 123,
      },
    });
  });

  it('treats non-zero status responses as terminal failures instead of leaving the page locked', () => {
    expect(
      resolveVideoMergeStatusResponse({
        response: {
          code: 404,
          message: 'job missing',
        },
        baselineMergedAtMs: 200,
        previousLastMergedAtMs: 100,
        fallbackFailureMessage: 'merge failed',
      })
    ).toEqual({
      failureCount: 0,
      mergeStatusRequiresManualRetry: false,
      clearActiveJob: true,
      toastKind: 'error',
      toastMessage: 'job missing',
      taskState: {
        taskStatus: 'failed',
        taskErrorMessage: 'job missing',
        taskProgress: null,
        taskCurrentStep: '',
      },
      serverLastMergedAtMs: 100,
    });
  });

  it('promotes successful status responses into completed state and a newer merged baseline', () => {
    expect(
      resolveVideoMergeStatusResponse({
        response: {
          code: 0,
          data: {
            status: 'success',
          },
        },
        baselineMergedAtMs: 450,
        previousLastMergedAtMs: 300,
        fallbackFailureMessage: 'merge failed',
      })
    ).toEqual({
      failureCount: 0,
      mergeStatusRequiresManualRetry: false,
      clearActiveJob: true,
      toastKind: 'success',
      toastMessage: null,
      taskState: {
        taskStatus: 'completed',
        taskErrorMessage: '',
        taskProgress: 100,
        taskCurrentStep: '',
      },
      serverLastMergedAtMs: 450,
    });
  });

  it('enters manual retry mode after repeated network failures without pretending the job disappeared', () => {
    const first = getNextMergeStatusPollState(0);
    const second = getNextMergeStatusPollState(first.failureCount);
    const third = getNextMergeStatusPollState(second.failureCount);
    const fourth = getNextMergeStatusPollState(third.failureCount);
    const fifth = getNextMergeStatusPollState(fourth.failureCount);

    expect(first.requiresManualRetry).toBe(false);
    expect(second.requiresManualRetry).toBe(false);
    expect(third.requiresManualRetry).toBe(false);
    expect(fourth.requiresManualRetry).toBe(false);
    expect(fifth).toEqual({
      failureCount: 5,
      requiresManualRetry: true,
    });
  });

  it('times out merge status polls and prevents overlapping in-flight requests when the network hangs', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-merge.ts', import.meta.url), 'utf8');

    expect(hookSource).toContain("import { fetchWithTimeout } from '../network/fetch-with-timeout';");
    expect(hookSource).toContain('const MERGE_STATUS_POLL_TIMEOUT_MS = 15_000;');
    expect(hookSource).toContain('const mergeStatusPollInFlightRef = useRef(false);');
    expect(hookSource).toContain('if (mergeStatusPollInFlightRef.current) return;');
    expect(hookSource).toContain('mergeStatusPollInFlightRef.current = true;');
    expect(hookSource).toContain("const resp = await fetchWithTimeout(");
    expect(hookSource).toContain('timeoutMs: MERGE_STATUS_POLL_TIMEOUT_MS,');
    expect(hookSource).toContain('mergeStatusPollInFlightRef.current = false;');
  });

  it('gives task progress polling a finite timeout and prevents overlapping hung requests', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-merge.ts', import.meta.url), 'utf8');

    expect(hookSource).toContain('const TASK_PROGRESS_POLL_TIMEOUT_MS = 15_000;');
    expect(hookSource).toContain('const taskProgressPollInFlightRef = useRef(false);');
    expect(hookSource).toContain('if (taskProgressPollInFlightRef.current) return;');
    expect(hookSource).toContain('taskProgressPollInFlightRef.current = true;');
    expect(hookSource).toContain("const resp = await fetchWithTimeout(`/api/video-task/getTaskProgress?taskId=${convertId}`, {");
    expect(hookSource).toContain('timeoutMs: TASK_PROGRESS_POLL_TIMEOUT_MS,');
    expect(hookSource).toContain('taskProgressPollInFlightRef.current = false;');
  });

  it('puts all download entry points behind finite timeouts instead of allowing weak-network hangs', () => {
    const hookSource = readFileSync(new URL('./use-video-editor-merge.ts', import.meta.url), 'utf8');

    expect(hookSource).toContain('const DOWNLOAD_REQUEST_TIMEOUT_MS = 15_000;');
    expect(hookSource).toContain("const response = await fetchWithTimeout(`/api/video-task/download-video?taskId=${convertId}&expiresIn=60`, {");
    expect(hookSource).toContain('const response = await fetchWithTimeout(');
    expect(hookSource).toContain('`/api/video-task/download-audio?taskId=${convertId}&key=${encodeURIComponent(key)}&expiresIn=60`');
    expect(hookSource).toContain('const response = await fetchWithTimeout(downloadUrl, {');
    expect(hookSource).toContain('timeoutMs: DOWNLOAD_REQUEST_TIMEOUT_MS,');
  });
});
