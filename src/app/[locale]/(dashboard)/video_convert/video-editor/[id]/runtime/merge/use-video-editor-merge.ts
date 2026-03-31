'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';

import { estimateTaskPercent } from '@/shared/lib/task-progress';
import { getAudioR2PathName } from '@/shared/lib/utils';

import { fetchWithTimeout } from '../network/fetch-with-timeout';
import { getHeaderDownloadState } from '../../header-download-actions';
import {
  getNextMergeStatusPollState,
  getVideoMergePrimaryActionState,
  hydrateVideoMergeMetadataState,
  reconcileMergeTerminalState,
  resolveVideoMergeStatusResponse,
  shouldPollActiveVideoMergeStatus,
  type ActiveVideoMergeJob,
} from '../../video-merge-state';

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
  hasUnsavedChanges: boolean;
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
    hasUnsavedChanges,
    serverLastMergedAtMs,
    setServerLastMergedAtMs,
    prepareForVideoMerge,
    persistPendingTimingsIfNeeded,
    requestVideoSave,
  } = args;

  const [taskStatus, setTaskStatus] = useState<string>('pending');
  const [taskErrorMessage, setTaskErrorMessage] = useState<string>('');
  const [taskProgress, setTaskProgress] = useState<number | null>(null);
  const [taskCurrentStep, setTaskCurrentStep] = useState<string>('');
  const [serverActiveMergeJob, setServerActiveMergeJob] = useState<ActiveVideoMergeJob | null>(null);
  const [mergeStatusRequiresManualRetry, setMergeStatusRequiresManualRetry] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const activeConvertIdRef = useRef(convertId);
  const mergeStatusPollFailureCountRef = useRef(0);
  const mergeStatusPollInFlightRef = useRef(false);
  const taskProgressPollInFlightRef = useRef(false);

  const hydrateTaskStateFromDetail = useCallback((taskMainItem: TaskMainHydratePayload) => {
    const nextTaskStatus = typeof taskMainItem?.status === 'string' ? taskMainItem.status : 'pending';
    setTaskStatus(nextTaskStatus);
    setTaskErrorMessage(typeof taskMainItem?.errorMessage === 'string' ? taskMainItem.errorMessage : '');
    const nextProgress = Number(taskMainItem?.progress);
    setTaskProgress(Number.isFinite(nextProgress) ? nextProgress : null);
    setTaskCurrentStep(typeof taskMainItem?.currentStep === 'string' ? taskMainItem.currentStep : '');
    const reconciled = reconcileMergeTerminalState({
      taskStatus: nextTaskStatus,
      activeJob: serverActiveMergeJob,
      requiresManualRetry: mergeStatusRequiresManualRetry,
      failureCount: mergeStatusPollFailureCountRef.current,
    });
    setServerActiveMergeJob(reconciled.activeJob);
    setMergeStatusRequiresManualRetry(reconciled.requiresManualRetry);
    mergeStatusPollFailureCountRef.current = reconciled.failureCount;
  }, [mergeStatusRequiresManualRetry, serverActiveMergeJob]);

  useEffect(() => {
    activeConvertIdRef.current = convertId;
  }, [convertId]);

  useEffect(() => {
    setTaskStatus('pending');
    setTaskErrorMessage('');
    setTaskProgress(null);
    setTaskCurrentStep('');
    setServerActiveMergeJob(null);
    setMergeStatusRequiresManualRetry(false);
    mergeStatusPollFailureCountRef.current = 0;
    setIsGeneratingVideo(false);
  }, [convertId]);

  useEffect(() => {
    const hydrated = hydrateVideoMergeMetadataState({
      previousLastMergedAtMs: 0,
      metadata: convertMetadata,
    });

    if (hydrated.lastMergedAtMs > 0) {
      setServerLastMergedAtMs((prev) => Math.max(prev, hydrated.lastMergedAtMs));
    }

    setServerActiveMergeJob(hydrated.activeJob);
  }, [convertId, convertMetadata, setServerLastMergedAtMs]);

  useEffect(() => {
    if (!convertId) return;
    if (!shouldPollActiveVideoMergeStatus(serverActiveMergeJob, mergeStatusRequiresManualRetry)) return;

    const jobId = serverActiveMergeJob?.jobId || '';
    const startedAt = Date.now();
    const timeoutMs = 60 * 60 * 1000;
    const baselineMergedAtMs = serverActiveMergeJob?.createdAtMs || Date.now();
    let cancelled = false;

    const applyTaskState = (nextTaskState: {
      taskStatus: string;
      taskErrorMessage: string;
      taskProgress: number | null;
      taskCurrentStep: string;
    }) => {
      setTaskStatus(nextTaskState.taskStatus);
      setTaskErrorMessage(nextTaskState.taskErrorMessage);
      setTaskProgress(nextTaskState.taskProgress);
      setTaskCurrentStep(nextTaskState.taskCurrentStep);
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
        if (cancelled) return;

        const resolution = resolveVideoMergeStatusResponse({
          response: back,
          baselineMergedAtMs,
          previousLastMergedAtMs: serverLastMergedAtMs,
          fallbackFailureMessage: t('audioList.toast.videoSaveFailed'),
        });

        mergeStatusPollFailureCountRef.current = resolution.failureCount;
        setMergeStatusRequiresManualRetry(resolution.mergeStatusRequiresManualRetry);

        if (resolution.taskState) {
          applyTaskState(resolution.taskState);
        }

        if (resolution.serverLastMergedAtMs > 0) {
          setServerLastMergedAtMs((prev) => Math.max(prev, resolution.serverLastMergedAtMs));
        }

        if (resolution.clearActiveJob) {
          setServerActiveMergeJob(null);
        }

        if (resolution.toastKind === 'success') {
          toast.success(t('audioList.toast.videoSaveCompleted'), { duration: 5000 });
          return;
        }

        if (resolution.toastKind === 'error' && resolution.toastMessage) {
          toast.error(resolution.toastMessage);
        }
      } catch {
        if (cancelled) return;
        const nextPollState = getNextMergeStatusPollState(mergeStatusPollFailureCountRef.current);
        mergeStatusPollFailureCountRef.current = nextPollState.failureCount;
        if (nextPollState.requiresManualRetry) {
          toast.error(t('header.mergeStatusRetryTooltip'));
          setMergeStatusRequiresManualRetry(true);
        }
      } finally {
        mergeStatusPollInFlightRef.current = false;
      }
    };

    void tick();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        if (!cancelled) {
          const message = t('audioList.toast.videoSaveFailed');
          mergeStatusPollFailureCountRef.current = 0;
          setMergeStatusRequiresManualRetry(false);
          setTaskStatus('failed');
          setTaskErrorMessage(message);
          setTaskProgress(null);
          setTaskCurrentStep('');
          toast.error(message);
          setServerActiveMergeJob(null);
        }
        return;
      }

      if (mergeStatusPollFailureCountRef.current >= 3) {
        clearInterval(timer);
        return;
      }

      void tick();
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      mergeStatusPollInFlightRef.current = false;
    };
  }, [convertId, mergeStatusRequiresManualRetry, serverActiveMergeJob?.createdAtMs, serverActiveMergeJob?.jobId, serverLastMergedAtMs, setServerLastMergedAtMs, t]);

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

  const isTaskRunning = taskStatus === 'pending' || taskStatus === 'processing';
  const isMergeJobActive = serverActiveMergeJob !== null;

  const headerProgressFillCls = useMemo(() => {
    if (taskStatus === 'completed') return 'bg-emerald-500/70';
    if (taskStatus === 'failed' || taskStatus === 'cancelled') return 'bg-destructive/70';
    if (taskStatus === 'processing') return 'bg-primary/80';
    return 'bg-primary/55';
  }, [taskStatus]);

  const headerProgressVisual = isTaskRunning ? Math.max(3, progressPercent) : progressPercent;

  const mergePrimaryAction = useMemo(
    () =>
      getVideoMergePrimaryActionState({
        isGeneratingVideo,
        isTaskRunning,
        isMergeJobActive,
        mergeStatusRequiresManualRetry,
        hasUnsavedChanges,
      }),
    [hasUnsavedChanges, isGeneratingVideo, isMergeJobActive, isTaskRunning, mergeStatusRequiresManualRetry]
  );

  const showHeaderBusySpinner = isGeneratingVideo || isTaskRunning || (isMergeJobActive && mergePrimaryAction.mode !== 'retry-status');

  const downloadBaseName = useMemo(() => {
    const rawName = typeof videoSourceFileName === 'string' ? videoSourceFileName.trim() : '';
    if (!rawName) return convertId;
    return rawName.replace(/\.[^/.]+$/, '') || convertId;
  }, [convertId, videoSourceFileName]);

  const headerDownloadState = useMemo(
    () =>
      getHeaderDownloadState({
        taskStatus,
        serverLastMergedAtMs,
        isTaskRunning,
        isMergeJobActive,
      }),
    [isMergeJobActive, isTaskRunning, serverLastMergedAtMs, taskStatus]
  );

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
    setMergeStatusRequiresManualRetry(false);
    setServerActiveMergeJob(args);
  }, []);

  const handleRetryMergeStatus = useCallback(() => {
    mergeStatusPollFailureCountRef.current = 0;
    setMergeStatusRequiresManualRetry(false);
  }, []);

  const handleGenerateVideo = useCallback(async () => {
    if (isGeneratingVideo) return;

    const taskId = convertId;
    setIsGeneratingVideo(true);
    try {
      const readyForMerge = await prepareForVideoMerge();
      if (activeConvertIdRef.current !== taskId || !readyForMerge) return;

      const timingReady = await persistPendingTimingsIfNeeded();
      if (activeConvertIdRef.current !== taskId || !timingReady) return;

      const ok = await requestVideoSave();
      if (activeConvertIdRef.current !== taskId) return;
      if (ok) {
        setTaskErrorMessage('');
        setTaskStatus('pending');
        setTaskProgress(0);
        setTaskCurrentStep('');
      }
    } catch (error) {
      if (activeConvertIdRef.current !== taskId) return;
      console.error('handleGenerateVideo failed:', error);
      toast.error(locale === 'zh' ? '操作失败，请重试' : 'Request failed. Please try again.');
    } finally {
      if (activeConvertIdRef.current === taskId) {
        setIsGeneratingVideo(false);
      }
    }
  }, [convertId, isGeneratingVideo, locale, persistPendingTimingsIfNeeded, prepareForVideoMerge, requestVideoSave]);

  const handleDownloadVideo = useCallback(async () => {
    if (!convertId || !headerDownloadState.isVisible || headerDownloadState.isDisabled) return;

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
  }, [convertId, downloadBaseName, headerDownloadState.isDisabled, headerDownloadState.isVisible, tDetail, triggerLinkDownload]);

  const handleDownloadAudio = useCallback(
    async (type: 'subtitle' | 'background') => {
      if (!convertId || !userId || !headerDownloadState.isVisible || headerDownloadState.isDisabled) return;

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
    [convertId, downloadBaseName, headerDownloadState.isDisabled, headerDownloadState.isVisible, tDetail, triggerLinkDownload, userId]
  );

  const handleDownloadSrt = useCallback(
    async (stepName: 'gen_srt' | 'translate_srt' | 'double_srt') => {
      if (!convertId || !headerDownloadState.isVisible || headerDownloadState.isDisabled) return;

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
    [convertId, downloadBaseName, headerDownloadState.isDisabled, headerDownloadState.isVisible, tDetail, triggerBlobDownload]
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
    mergePrimaryAction,
    headerProgressFillCls,
    headerProgressVisual,
    showHeaderBusySpinner,
    headerDownloadState,
    handleGenerateVideo,
    handleRetryMergeStatus,
    handleVideoMergeStarted,
    handleDownloadVideo,
    handleDownloadAudio,
    handleDownloadSrt,
    hydrateTaskStateFromDetail,
  };
}
