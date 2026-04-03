'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';

import { estimateTaskPercent } from '@/shared/lib/task-progress';
import { getAudioR2PathName } from '@/shared/lib/utils';

import { fetchWithTimeout } from '../network/fetch-with-timeout';
import type { HeaderDownloadState } from '../../header-download-actions';
import {
  getNextMergeStatusPollState,
  hydrateVideoMergeMetadataState,
  resolveVideoMergeStatusResponse,
  shouldPollActiveVideoMergeStatus,
} from '../../video-merge-state';
import { buildVideoEditorMergeSession } from './video-editor-merge-session';
import { createInitialMergeSessionState, mergeSessionReducer } from './merge-session-owner';

const MERGE_STATUS_POLL_TIMEOUT_MS = 15_000;
const TASK_PROGRESS_POLL_TIMEOUT_MS = 15_000;
const DOWNLOAD_REQUEST_TIMEOUT_MS = 15_000;

type TranslateFn = (key: string) => string;

type UseVideoEditorMergeArgs = {
  convertId: string;
  locale: string;
  t: TranslateFn;
  tDetail: TranslateFn;
  convertMetadata: unknown;
  fallbackProgress: unknown;
  fallbackCurrentStep: unknown;
  userId: string;
  videoSourceFileName?: string | null;
  serverLastMergedAtMs: number;
  setServerLastMergedAtMs: Dispatch<SetStateAction<number>>;
  prepareForVideoMerge: () => Promise<boolean | undefined>;
  persistPendingTimingsIfNeeded: () => Promise<boolean>;
  requestVideoSave: () => Promise<boolean | undefined>;
};

type TaskMainHydratePayload = {
  status?: unknown;
  errorMessage?: unknown;
  progress?: unknown;
  currentStep?: unknown;
} | null;

type StatusMeta = {
  label: string;
  cls: string;
  icon: 'dot' | 'spin' | 'check' | 'x';
};

export function useVideoEditorMerge(args: UseVideoEditorMergeArgs) {
  const {
    convertId,
    locale,
    t,
    tDetail,
    convertMetadata,
    fallbackProgress,
    fallbackCurrentStep,
    userId,
    videoSourceFileName,
    serverLastMergedAtMs,
    setServerLastMergedAtMs,
    prepareForVideoMerge,
    persistPendingTimingsIfNeeded,
    requestVideoSave,
  } = args;

  const [mergeState, dispatchMerge] = useReducer(mergeSessionReducer, undefined, createInitialMergeSessionState);
  const activeConvertIdRef = useRef(convertId);
  const lastMergedAtMsRef = useRef(Math.max(0, serverLastMergedAtMs));
  const mergeStatusPollFailureCountRef = useRef(0);
  const mergeStatusPollInFlightRef = useRef(false);
  const taskProgressPollInFlightRef = useRef(false);
  // Critical Fix #1: Track backoff timeouts to prevent leaks
  const backoffTimeoutIdsRef = useRef<Set<number>>(new Set());
  // P0 Fix #3: Use ref for cancelled flag to prevent race conditions
  const mergeStatusPollCancelledRef = useRef(false);

  const mergeSession = useMemo(
    () =>
      buildVideoEditorMergeSession({
        state: mergeState,
        view: {
          isTaskRunning: mergeState.taskStatus === 'pending' || mergeState.taskStatus === 'processing',
          isMergeJobActive: mergeState.activeJob !== null,
          isGeneratingVideo: mergeState.phase === 'preparing' || mergeState.phase === 'requesting_merge',
          mergeStatusRequiresManualRetry: mergeState.phase === 'manual_retry_required',
        },
      }),
    [mergeState]
  );

  const taskStatus = mergeSession.state.taskStatus;
  const taskErrorMessage = mergeSession.state.taskErrorMessage;
  const taskProgress = mergeSession.state.taskProgress;
  const taskCurrentStep = mergeSession.state.taskCurrentStep;
  const serverActiveMergeJob = mergeSession.state.activeJob;
  const isTaskRunning = mergeSession.view.isTaskRunning;
  const isMergeJobActive = mergeSession.view.isMergeJobActive;
  const isGeneratingVideo = mergeSession.view.isGeneratingVideo;
  const mergeStatusRequiresManualRetry = mergeSession.view.mergeStatusRequiresManualRetry;

  const hydrateTaskStateFromDetail = useCallback((taskMainItem: TaskMainHydratePayload) => {
    const nextTaskStatus = typeof taskMainItem?.status === 'string' ? taskMainItem.status : 'pending';
    const nextProgress = Number(taskMainItem?.progress);
    dispatchMerge({
      type: 'task_state_hydrated',
      taskStatus: nextTaskStatus,
      taskErrorMessage: typeof taskMainItem?.errorMessage === 'string' ? taskMainItem.errorMessage : '',
      taskProgress: Number.isFinite(nextProgress) ? nextProgress : null,
      taskCurrentStep: typeof taskMainItem?.currentStep === 'string' ? taskMainItem.currentStep : '',
    });
    if (nextTaskStatus === 'completed' || nextTaskStatus === 'failed' || nextTaskStatus === 'cancelled') {
      mergeStatusPollFailureCountRef.current = 0;
    }
  }, []);

  useEffect(() => {
    activeConvertIdRef.current = convertId;
  }, [convertId]);

  useEffect(() => {
    lastMergedAtMsRef.current = Math.max(serverLastMergedAtMs, mergeSession.state.lastMergedAtMs);
  }, [mergeSession.state.lastMergedAtMs, serverLastMergedAtMs]);

  useEffect(() => {
    dispatchMerge({ type: 'reset_for_convert' });
    mergeStatusPollFailureCountRef.current = 0;
  }, [convertId]);

  useEffect(() => {
    const hydrated = hydrateVideoMergeMetadataState({
      previousLastMergedAtMs: lastMergedAtMsRef.current,
      metadata: convertMetadata,
    });

    if (hydrated.lastMergedAtMs > 0) {
      setServerLastMergedAtMs((prev) => Math.max(prev, hydrated.lastMergedAtMs));
      dispatchMerge({ type: 'last_merged_at_updated', lastMergedAtMs: hydrated.lastMergedAtMs });
    }

    dispatchMerge({
      type: 'metadata_hydrated',
      activeJob: hydrated.activeJob,
      lastMergedAtMs: hydrated.lastMergedAtMs,
    });
  }, [convertId, convertMetadata, setServerLastMergedAtMs]);

  useEffect(() => {
    if (!convertId) return;
    if (!shouldPollActiveVideoMergeStatus(serverActiveMergeJob, mergeStatusRequiresManualRetry)) return;

    const jobId = serverActiveMergeJob?.jobId || '';
    const startedAt = Date.now();
    const timeoutMs = 60 * 60 * 1000;
    const baselineMergedAtMs = serverActiveMergeJob?.createdAtMs || Date.now();
    // P0 Fix #3: Use ref instead of local variable to prevent race conditions
    mergeStatusPollCancelledRef.current = false;

    // Critical Fix #3: Exponential backoff delays
    const getBackoffDelayMs = (failureCount: number) => {
      if (failureCount === 0) return 0;
      return Math.min(32000, 4000 * Math.pow(2, failureCount - 1));
    };

    const tick = async () => {
      if (mergeStatusPollInFlightRef.current) return;
      mergeStatusPollInFlightRef.current = true;
      try {
        const resp = await fetchWithTimeout(
          `/api/video-task/generate-video?taskId=${encodeURIComponent(convertId)}&jobId=${encodeURIComponent(jobId)}&mode=status`,
          {
            timeoutMs: MERGE_STATUS_POLL_TIMEOUT_MS,
          }
        );
        const back = await resp.json().catch(() => null);
        if (mergeStatusPollCancelledRef.current) return;

        const resolution = resolveVideoMergeStatusResponse({
          response: back,
          baselineMergedAtMs,
          previousLastMergedAtMs: lastMergedAtMsRef.current,
          fallbackFailureMessage: t('audioList.toast.videoSaveFailed'),
        });

        mergeStatusPollFailureCountRef.current = resolution.failureCount;

        if (resolution.taskState) {
          dispatchMerge({
            type: 'task_state_hydrated',
            taskStatus: resolution.taskState.taskStatus,
            taskErrorMessage: resolution.taskState.taskErrorMessage,
            taskProgress: resolution.taskState.taskProgress,
            taskCurrentStep: resolution.taskState.taskCurrentStep,
          });
        }

        if (resolution.serverLastMergedAtMs > 0) {
          setServerLastMergedAtMs((prev) => Math.max(prev, resolution.serverLastMergedAtMs));
          dispatchMerge({
            type: 'last_merged_at_updated',
            lastMergedAtMs: resolution.serverLastMergedAtMs,
          });
        }

        if (resolution.toastKind === 'success') {
          toast.success(t('audioList.toast.videoSaveCompleted'), { duration: 5000 });
          return;
        }

        if (resolution.toastKind === 'error' && resolution.toastMessage) {
          toast.error(resolution.toastMessage);
        }
      } catch {
        if (mergeStatusPollCancelledRef.current) return;
        const nextPollState = getNextMergeStatusPollState(mergeStatusPollFailureCountRef.current);
        mergeStatusPollFailureCountRef.current = nextPollState.failureCount;
        dispatchMerge({
          type: 'status_poll_network_failed',
          failureCount: nextPollState.failureCount,
          requiresManualRetry: nextPollState.requiresManualRetry,
        });
        if (nextPollState.requiresManualRetry) {
          toast.error(t('header.mergeStatusRetryTooltip'));
        }
      } finally {
        mergeStatusPollInFlightRef.current = false;
      }
    };

    void tick();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        if (!mergeStatusPollCancelledRef.current) {
          const message = t('audioList.toast.videoSaveFailed');
          mergeStatusPollFailureCountRef.current = 0;
          dispatchMerge({
            type: 'task_state_hydrated',
            taskStatus: 'failed',
            taskErrorMessage: message,
            taskProgress: null,
            taskCurrentStep: '',
          });
          toast.error(message);
        }
        return;
      }

      // Critical Fix #3: Check failure threshold (now 5 instead of 3)
      if (mergeStatusPollFailureCountRef.current >= 5) {
        clearInterval(timer);
        return;
      }

      // Critical Fix #1: Apply exponential backoff delay with timeout tracking
      const backoffDelay = getBackoffDelayMs(mergeStatusPollFailureCountRef.current);
      if (backoffDelay > 0) {
        const timeoutId = window.setTimeout(() => {
          backoffTimeoutIdsRef.current.delete(timeoutId);
          if (!mergeStatusPollCancelledRef.current) void tick();
        }, backoffDelay);
        backoffTimeoutIdsRef.current.add(timeoutId);
      } else {
        void tick();
      }
    }, 4000);

    return () => {
      mergeStatusPollCancelledRef.current = true;
      clearInterval(timer);
      // Critical Fix #1: Clear all backoff timeouts
      backoffTimeoutIdsRef.current.forEach((id) => clearTimeout(id));
      backoffTimeoutIdsRef.current.clear();
      mergeStatusPollInFlightRef.current = false;
    };
  }, [convertId, mergeStatusRequiresManualRetry, serverActiveMergeJob?.createdAtMs, serverActiveMergeJob?.jobId, setServerLastMergedAtMs, t]);

  useEffect(() => {
    if (!convertId) return;
    if (taskStatus !== 'pending' && taskStatus !== 'processing') return;

    let cancelled = false;
    const tick = async () => {
      if (taskProgressPollInFlightRef.current) return;
      taskProgressPollInFlightRef.current = true;
      try {
        const resp = await fetchWithTimeout(`/api/video-task/getTaskProgress?taskId=${convertId}`, {
          timeoutMs: TASK_PROGRESS_POLL_TIMEOUT_MS,
        });
        const back = await resp.json().catch(() => null);
        const item = back?.data?.taskItem;
        if (cancelled) return;
        if (back?.code === 0 && item?.id) {
          hydrateTaskStateFromDetail(item);
        }
      } catch {
        // Silent: the editor should stay usable even if polling fails.
      } finally {
        taskProgressPollInFlightRef.current = false;
      }
    };

    void tick();
    const timer = setInterval(tick, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      taskProgressPollInFlightRef.current = false;
    };
  }, [convertId, hydrateTaskStateFromDetail, taskStatus]);

  const statusMeta = useMemo<StatusMeta>(() => {
    const map: Record<string, StatusMeta> = {
      pending: {
        label: tDetail('status.pending'),
        cls: 'text-amber-500 border-amber-500/20 bg-amber-500/5',
        icon: 'dot',
      },
      processing: {
        label: tDetail('status.processing'),
        cls: 'text-orange-500 border-orange-500/20 bg-orange-500/5',
        icon: 'spin',
      },
      completed: {
        label: tDetail('status.completed'),
        cls: 'text-green-600 border-green-600/20 bg-green-500/5',
        icon: 'check',
      },
      failed: {
        label: tDetail('status.failed'),
        cls: 'text-red-500 border-red-500/20 bg-red-500/5',
        icon: 'x',
      },
      cancelled: {
        label: tDetail('status.cancelled'),
        cls: 'text-muted-foreground border-white/10 bg-white/[0.03]',
        icon: 'x',
      },
    };

    return map[taskStatus] || { label: taskStatus, cls: 'border-white/10 bg-white/[0.03] text-muted-foreground', icon: 'dot' };
  }, [tDetail, taskStatus]);

  const progressPercent = useMemo(() => {
    return estimateTaskPercent({
      status: taskStatus,
      progress: taskProgress ?? fallbackProgress,
      currentStep: taskCurrentStep || (typeof fallbackCurrentStep === 'string' ? fallbackCurrentStep : ''),
    });
  }, [fallbackCurrentStep, fallbackProgress, taskCurrentStep, taskProgress, taskStatus]);

  const headerProgressFillCls = useMemo(() => {
    if (taskStatus === 'completed') return 'bg-emerald-500/70';
    if (taskStatus === 'failed' || taskStatus === 'cancelled') return 'bg-destructive/70';
    if (taskStatus === 'processing') return 'bg-primary/80';
    return 'bg-primary/55';
  }, [taskStatus]);

  const headerProgressVisual = isTaskRunning ? Math.max(3, progressPercent) : progressPercent;

  const downloadBaseName = useMemo(() => {
    const rawName = typeof videoSourceFileName === 'string' ? videoSourceFileName.trim() : '';
    if (!rawName) return convertId;
    return rawName.replace(/\.[^/.]+$/, '') || convertId;
  }, [convertId, videoSourceFileName]);

  const effectiveLastMergedAtMs = Math.max(serverLastMergedAtMs, mergeSession.state.lastMergedAtMs);

  const downloadGuardRef = useRef<HeaderDownloadState>({ isVisible: false, isDisabled: true, tooltipKey: null });

  const triggerLinkDownload = useCallback((url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const triggerBlobDownload = useCallback((blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  }, []);

  const handleVideoMergeStarted = useCallback((args: { jobId: string; createdAtMs: number }) => {
    mergeStatusPollFailureCountRef.current = 0;
    dispatchMerge({
      type: 'merge_job_registered',
      job: args,
    });
  }, []);

  const handleRetryMergeStatus = useCallback(() => {
    mergeStatusPollFailureCountRef.current = 0;
    dispatchMerge({ type: 'manual_retry_reset' });
  }, []);

  const handleGenerateVideo = useCallback(async () => {
    if (isGeneratingVideo) return;

    const taskId = convertId;
    dispatchMerge({ type: 'generate_started' });
    try {
      const readyForMerge = await prepareForVideoMerge();
      if (activeConvertIdRef.current !== taskId) return;
      if (!readyForMerge) {
        dispatchMerge({ type: 'generate_cancelled' });
        return;
      }

      // P0 Fix #1: Flush pending timings before merge (no lock needed)
      const timingReady = await persistPendingTimingsIfNeeded();
      if (activeConvertIdRef.current !== taskId) return;
      if (!timingReady) {
        dispatchMerge({ type: 'generate_cancelled' });
        return;
      }

      dispatchMerge({ type: 'merge_request_started' });
      const ok = await requestVideoSave();
      if (activeConvertIdRef.current !== taskId) return;
      if (ok) {
        dispatchMerge({
          type: 'task_state_hydrated',
          taskStatus: 'pending',
          taskErrorMessage: '',
          taskProgress: 0,
          taskCurrentStep: '',
        });
        return;
      }

      dispatchMerge({ type: 'generate_cancelled' });
    } catch (error) {
      if (activeConvertIdRef.current !== taskId) return;
      dispatchMerge({ type: 'generate_cancelled' });
      console.error('handleGenerateVideo failed:', error);
      toast.error(locale === 'zh' ? '操作失败，请重试' : 'Request failed. Please try again.');
    }
  }, [convertId, isGeneratingVideo, locale, persistPendingTimingsIfNeeded, prepareForVideoMerge, requestVideoSave]);

  const handleDownloadVideo = useCallback(async () => {
    const guard = downloadGuardRef.current;
    if (!convertId || !guard.isVisible || guard.isDisabled) return;

    try {
      const response = await fetchWithTimeout(`/api/video-task/download-video?taskId=${convertId}&expiresIn=60`, {
        timeoutMs: DOWNLOAD_REQUEST_TIMEOUT_MS,
      });
      const data = await response.json();
      if (data?.code !== 0) {
        toast.error(data?.message || tDetail('toast.downloadLinkFailed'));
        return;
      }

      triggerLinkDownload(data.data.url, `${downloadBaseName}.mp4`);
    } catch (error) {
      console.error('[VideoEditorPage] Video download failed:', error);
      toast.error(tDetail('toast.downloadFailed'));
    }
  }, [convertId, downloadBaseName, tDetail, triggerLinkDownload]);

  const handleDownloadAudio = useCallback(
    async (type: 'subtitle' | 'background') => {
      const guard = downloadGuardRef.current;
      if (!convertId || !userId || !guard.isVisible || guard.isDisabled) return;

      const key =
        type === 'background'
          ? getAudioR2PathName(userId, convertId, 'split_vocal_bkground/audio/audio_bkground.wav')
          : getAudioR2PathName(userId, convertId, 'merge_audios/audio/audio_new.wav');

      try {
        const response = await fetchWithTimeout(
          `/api/video-task/download-audio?taskId=${convertId}&key=${encodeURIComponent(key)}&expiresIn=60`,
          {
            timeoutMs: DOWNLOAD_REQUEST_TIMEOUT_MS,
          }
        );
        const data = await response.json();
        if (data?.code !== 0) {
          toast.error(data?.message || tDetail('toast.downloadLinkFailed'));
          return;
        }

        triggerLinkDownload(data.data.url, `${downloadBaseName}_${type === 'background' ? 'background' : 'dub'}.wav`);
      } catch (error) {
        console.error('[VideoEditorPage] Audio download failed:', error);
        toast.error(tDetail('toast.downloadFailed'));
      }
    },
    [convertId, downloadBaseName, tDetail, triggerLinkDownload, userId]
  );

  const handleDownloadSrt = useCallback(
    async (stepName: 'gen_srt' | 'translate_srt' | 'double_srt') => {
      const guard = downloadGuardRef.current;
      if (!convertId || !guard.isVisible || guard.isDisabled) return;

      try {
        const params = new URLSearchParams({
          taskId: convertId,
          stepName,
          fileName: downloadBaseName,
        });
        const downloadUrl =
          stepName === 'double_srt'
            ? `/api/video-task/download-double-srt?${params.toString()}`
            : `/api/video-task/download-one-srt?${params.toString()}`;
        const response = await fetchWithTimeout(downloadUrl, {
          timeoutMs: DOWNLOAD_REQUEST_TIMEOUT_MS,
        });
        if (!response.ok) {
          const err = await response.json().catch(() => null);
          toast.error(err?.message || tDetail('toast.subtitleDownloadFailed'));
          return;
        }

        const fileSuffix = stepName === 'gen_srt' ? 'original' : stepName === 'translate_srt' ? 'translated' : 'bilingual';
        const blob = await response.blob();
        triggerBlobDownload(blob, `${downloadBaseName}_${fileSuffix}.srt`);
      } catch (error) {
        console.error('[VideoEditorPage] Subtitle download failed:', error);
        toast.error(tDetail('toast.subtitleDownloadFailed'));
      }
    },
    [convertId, downloadBaseName, tDetail, triggerBlobDownload]
  );

  return {
    taskStatus,
    taskErrorMessage,
    taskProgress,
    taskCurrentStep,
    statusMeta,
    progressPercent,
    isTaskRunning,
    isMergeJobActive,
    isGeneratingVideo,
    mergeStatusRequiresManualRetry,
    effectiveLastMergedAtMs,
    downloadGuardRef,
    headerProgressFillCls,
    headerProgressVisual,
    handleGenerateVideo,
    handleRetryMergeStatus,
    handleVideoMergeStarted,
    handleDownloadVideo,
    handleDownloadAudio,
    handleDownloadSrt,
    hydrateTaskStateFromDetail,
  };
}
