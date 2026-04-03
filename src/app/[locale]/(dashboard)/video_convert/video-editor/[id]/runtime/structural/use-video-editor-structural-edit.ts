'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';

import type { ConvertObj, SubtitleTrackItem } from '@/shared/components/video-editor/types';

import { getStructuralEditBlockReason, getSubtitleSplitAvailability } from '../../video-editor-structural-edit';
import { fetchWithTimeout, isAbortLikeError } from '../network/fetch-with-timeout';
import type { VideoEditorTimingSession } from '../timing/video-editor-timing-session';

const STRUCTURAL_REQUEST_TIMEOUT_MS = 15_000;
const OPERATION_HISTORY_TIMEOUT_MS = 10_000;

type TranslateFn = (key: string) => string;

type UseVideoEditorStructuralEditArgs = {
  convertId: string;
  locale: string;
  t: TranslateFn;
  convertObj: ConvertObj | null;
  subtitleTrack: SubtitleTrackItem[];
  currentTimeSec: number;
  isPlaying: boolean;
  isGeneratingVideo: boolean;
  isTaskRunning: boolean;
  isMergeJobActive: boolean;
  timingSession: VideoEditorTimingSession;
  setConvertObj: Dispatch<SetStateAction<ConvertObj | null>>;
  clearActiveTimelineClip: () => void;
  prepareForStructuralEdit: () => Promise<boolean | undefined>;
  scrollToItem: (id: string) => void;
  // High Fix #6: Make pausePlaybackBeforeSplit async
  pausePlaybackBeforeSplit?: () => Promise<void>;
  clearVoiceCache: () => void;
};

type OperationHistoryItem = {
  operationId?: string;
  rollbackStatus?: number;
};

export function useVideoEditorStructuralEdit(args: UseVideoEditorStructuralEditArgs) {
  const {
    convertId,
    locale,
    t,
    convertObj,
    subtitleTrack,
    currentTimeSec,
    isPlaying,
    isGeneratingVideo,
    isTaskRunning,
    isMergeJobActive,
    timingSession,
    setConvertObj,
    clearActiveTimelineClip,
    prepareForStructuralEdit,
    scrollToItem,
    pausePlaybackBeforeSplit,
    clearVoiceCache,
  } = args;

  const [isSplittingSubtitle, setIsSplittingSubtitle] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [hasUndoableOps, setHasUndoableOps] = useState(false);
  const [undoCountdown, setUndoCountdown] = useState(0);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const undoLatestOpRef = useRef<OperationHistoryItem | null>(null);
  const undoFetchPromiseRef = useRef<Promise<OperationHistoryItem | null> | null>(null);
  const activeTaskIdRef = useRef<string | null>(null);
  const splitScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // High Fix #5: Track timeout ID for proper cleanup
  const timingPersistTimeoutIdRef = useRef<number | null>(null);

  const structuralEditBlockReason = useMemo(
    () =>
      getStructuralEditBlockReason({
        isGeneratingVideo,
        isTaskRunning,
        isMergeJobActive,
      }),
    [isGeneratingVideo, isMergeJobActive, isTaskRunning]
  );

  const splitAvailability = useMemo(
    () =>
      getSubtitleSplitAvailability({
        currentTimeSec,
        subtitleTrack,
      }),
    [currentTimeSec, subtitleTrack]
  );

  const splitDisabled = !convertObj || isGeneratingVideo || isSplittingSubtitle || Boolean(structuralEditBlockReason) || !splitAvailability.canSplit;
  const undoDisabled = Boolean(structuralEditBlockReason) && undoCountdown === 0;

  const structuralEditBlockedMessage = t('videoEditor.tooltips.structuralEditBlocked');

  const notifyStructuralEditBlocked = useCallback(() => {
    toast.error(structuralEditBlockedMessage);
  }, [structuralEditBlockedMessage]);

  const fetchOperationHistory = useCallback(async () => {
    const resp = await fetchWithTimeout(`/api/video-task/operation-history?taskId=${convertId}`, {
      timeoutMs: OPERATION_HISTORY_TIMEOUT_MS,
    });
    const data = await resp.json().catch(() => null);
    if (!resp.ok || !Array.isArray(data?.data)) {
      throw new Error('operation history failed');
    }
    return data.data as OperationHistoryItem[];
  }, [convertId]);

  const handleUndoCancel = useCallback(() => {
    if (undoTimerRef.current) {
      clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    if (undoIntervalRef.current) {
      clearInterval(undoIntervalRef.current);
      undoIntervalRef.current = null;
    }
    setUndoCountdown(0);
    undoLatestOpRef.current = null;
    undoFetchPromiseRef.current = null;
  }, []);

  useEffect(() => {
    activeTaskIdRef.current = convertId || null;
    handleUndoCancel();
    if (splitScrollTimerRef.current) {
      clearTimeout(splitScrollTimerRef.current);
      splitScrollTimerRef.current = null;
    }
    setIsSplittingSubtitle(false);
    setIsRollingBack(false);
    setHasUndoableOps(false);

    if (!convertId) return;
    const taskId = convertId;
    fetchOperationHistory()
      .then((data) => {
        if (activeTaskIdRef.current !== taskId) return;
        const has = data?.some((op: OperationHistoryItem) => op.rollbackStatus === 0);
        setHasUndoableOps(Boolean(has));
      })
      .catch(() => {});
  }, [convertId, fetchOperationHistory, handleUndoCancel]);

  useEffect(() => {
    return () => {
      if (splitScrollTimerRef.current) {
        clearTimeout(splitScrollTimerRef.current);
        splitScrollTimerRef.current = null;
      }
      handleUndoCancel();
    };
  }, [handleUndoCancel]);

  const executeUndoNow = useCallback(async () => {
    const taskId = convertId;
    if (!taskId || activeTaskIdRef.current !== taskId) return;
    if (undoIntervalRef.current) {
      clearInterval(undoIntervalRef.current);
      undoIntervalRef.current = null;
    }

    let op = undoLatestOpRef.current;

    setIsRollingBack(true);
    setUndoCountdown(0);

    if (!op && undoFetchPromiseRef.current) {
      op = await undoFetchPromiseRef.current;
    }
    if (activeTaskIdRef.current !== taskId) return;

    if (!op) {
      toast.error(t('rollback.failed'));
      setIsRollingBack(false);
      return;
    }

    try {
      if (structuralEditBlockReason) {
        notifyStructuralEditBlocked();
        return;
      }

      const structuralEditReady = await prepareForStructuralEdit();
      if (activeTaskIdRef.current !== taskId) return;
      if (!structuralEditReady) return;

      const resp = await fetchWithTimeout('/api/video-task/rollback-operation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: convertId,
          operationId: op.operationId,
        }),
        timeoutMs: STRUCTURAL_REQUEST_TIMEOUT_MS,
      });
      const back = await resp.json().catch(() => null);
      if (activeTaskIdRef.current !== taskId) return;
      if (!resp.ok || back?.code !== 0) {
        toast.error(back?.message || t('rollback.failed'));
        return;
      }

      clearVoiceCache();
      clearActiveTimelineClip();

      setConvertObj((prevObj) => {
        if (!prevObj) return prevObj;
        return {
          ...prevObj,
          srt_convert_arr: back.data?.translate ?? prevObj.srt_convert_arr,
          srt_source_arr: back.data?.source ?? prevObj.srt_source_arr,
        };
      });
      timingSession.actions.reconcilePendingTimingAfterRollback(back.data?.translate ?? []);

      toast.success(t('rollback.success'));
      try {
        const histData = await fetchOperationHistory();
        if (activeTaskIdRef.current !== taskId) return;
        const stillHas = histData?.some((item: OperationHistoryItem) => item.rollbackStatus === 0);
        setHasUndoableOps(Boolean(stillHas));
      } catch {
        if (activeTaskIdRef.current !== taskId) return;
        setHasUndoableOps(false);
      }
    } catch (error) {
      if (activeTaskIdRef.current !== taskId) return;
      if (!isAbortLikeError(error)) {
        toast.error(t('rollback.failed'));
      }
    } finally {
      if (activeTaskIdRef.current !== taskId) return;
      setIsRollingBack(false);
      undoLatestOpRef.current = null;
      undoFetchPromiseRef.current = null;
    }
  }, [clearVoiceCache, convertId, fetchOperationHistory, notifyStructuralEditBlocked, prepareForStructuralEdit, setConvertObj, structuralEditBlockReason, t, timingSession]);

  const handleRollbackLatest = useCallback(() => {
    if (isRollingBack || undoCountdown > 0) return;
    if (structuralEditBlockReason) {
      notifyStructuralEditBlocked();
      return;
    }
    const taskId = convertId;
    if (!taskId) return;

    undoLatestOpRef.current = null;
    setUndoCountdown(3);

    undoIntervalRef.current = setInterval(() => {
      setUndoCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(undoIntervalRef.current!);
          undoIntervalRef.current = null;
          return 1;
        }
        return prev - 1;
      });
    }, 1000);

    undoFetchPromiseRef.current = fetchOperationHistory()
      .then((data) => {
        if (activeTaskIdRef.current !== taskId) return null;
        const latest = (data ?? []).find((item: OperationHistoryItem) => item.rollbackStatus === 0) ?? null;
        if (!latest) {
          handleUndoCancel();
          toast.info(t('rollback.nothingToUndo'));
          return null;
        }
        undoLatestOpRef.current = latest;
        return latest;
      })
      .catch(() => {
        if (activeTaskIdRef.current !== taskId) return null;
        handleUndoCancel();
        toast.error(t('rollback.failed'));
        return null;
      });

    undoTimerRef.current = setTimeout(() => {
      if (activeTaskIdRef.current !== taskId) return;
      undoTimerRef.current = null;
      void executeUndoNow();
    }, 3000);
  }, [convertId, executeUndoNow, fetchOperationHistory, handleUndoCancel, isRollingBack, notifyStructuralEditBlocked, structuralEditBlockReason, t, undoCountdown]);

  const handleSubtitleSplit = useCallback(async () => {
    if (!convertObj || isSplittingSubtitle) return;
    if (structuralEditBlockReason) {
      notifyStructuralEditBlocked();
      return;
    }
    const taskId = convertId;
    if (!taskId) return;

    if (!splitAvailability.canSplit || !splitAvailability.clip) {
      toast.error(t(splitAvailability.reason === 'too-close' ? 'videoEditor.toast.splitTooClose' : 'videoEditor.toast.splitNoClip'));
      return;
    }

    setIsSplittingSubtitle(true);
    try {
      const structuralEditReady = await prepareForStructuralEdit();
      if (activeTaskIdRef.current !== taskId) return;
      if (!structuralEditReady) return;

      // High Fix #5: Increase timeout from 20s to 30s and track timeout ID
      const timingPersistPromise = timingSession.actions.persistPendingTimingsIfNeeded({ reason: 'split' });
      const timeoutPromise = new Promise<boolean>((_, reject) => {
        timingPersistTimeoutIdRef.current = window.setTimeout(() => {
          timingPersistTimeoutIdRef.current = null;
          reject(new Error('TIMING_PERSIST_TIMEOUT'));
        }, 30000); // Increased from 20s to 30s
      });

      let okTiming: boolean;
      try {
        okTiming = await Promise.race([timingPersistPromise, timeoutPromise]);
        // Clear timeout on success
        if (timingPersistTimeoutIdRef.current) {
          clearTimeout(timingPersistTimeoutIdRef.current);
          timingPersistTimeoutIdRef.current = null;
        }
      } catch (error) {
        // Clear timeout on error
        if (timingPersistTimeoutIdRef.current) {
          clearTimeout(timingPersistTimeoutIdRef.current);
          timingPersistTimeoutIdRef.current = null;
        }

        if (activeTaskIdRef.current !== taskId) return;
        const isTimeout = error instanceof Error && error.message === 'TIMING_PERSIST_TIMEOUT';
        toast.error(isTimeout ? t('videoEditor.toast.splitTimingTimeout') : t('videoEditor.toast.splitFailed'));
        return;
      }
      if (activeTaskIdRef.current !== taskId) return;
      if (!okTiming) return;

      // High Fix #6: Await pausePlaybackBeforeSplit
      if (pausePlaybackBeforeSplit) await pausePlaybackBeforeSplit();

      const effectiveConvertText = typeof splitAvailability.clip.text === 'string' ? splitAvailability.clip.text : '';
      const splitClipId = timingSession.actions.remapSubtitleIdAfterTimingSave(splitAvailability.clip.id);
      const resp = await fetchWithTimeout('/api/video-task/split-subtitle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: convertId,
          clipId: splitClipId,
          splitAtMs: splitAvailability.splitAtMs,
          effectiveConvertText,
        }),
        timeoutMs: STRUCTURAL_REQUEST_TIMEOUT_MS,
      });
      const back = await resp.json().catch(() => null);
      if (activeTaskIdRef.current !== taskId) return;
      if (!resp.ok || back?.code !== 0) {
        toast.error(back?.message || t('videoEditor.toast.splitFailed'));
        return;
      }

      const newTranslate: any[] = back.data?.translate ?? [];
      const firstSplitChildId: string | null = back.data?.newIds?.leftTranslateId ?? null;

      clearVoiceCache();

      setConvertObj((prevObj) => {
        if (!prevObj) return prevObj;
        return {
          ...prevObj,
          srt_convert_arr: newTranslate.length > 0 ? newTranslate : prevObj.srt_convert_arr,
          srt_source_arr: back.data?.source ?? prevObj.srt_source_arr,
        };
      });
      clearActiveTimelineClip();

      if (firstSplitChildId) {
        if (splitScrollTimerRef.current) {
          clearTimeout(splitScrollTimerRef.current);
        }
        splitScrollTimerRef.current = setTimeout(() => {
          splitScrollTimerRef.current = null;
          if (activeTaskIdRef.current !== taskId) return;
          scrollToItem(firstSplitChildId);
        }, 100);
      }

      const splitOpId = back.data?.splitOperationId;
      if (splitOpId) {
        setHasUndoableOps(true);
      }

      toast.success(t('videoEditor.toast.splitNeedVoice'));
    } catch (error) {
      if (activeTaskIdRef.current !== taskId) return;
      console.error('handleSubtitleSplit failed:', error);
      if (!isAbortLikeError(error)) {
        toast.error(t('videoEditor.toast.splitFailed'));
      }
    } finally {
      if (activeTaskIdRef.current !== taskId) return;
      setIsSplittingSubtitle(false);
    }
  }, [
    convertId,
    convertObj,
    clearVoiceCache,
    isSplittingSubtitle,
    notifyStructuralEditBlocked,
    pausePlaybackBeforeSplit,
    prepareForStructuralEdit,
    scrollToItem,
    setConvertObj,
    clearActiveTimelineClip,
    splitAvailability,
    structuralEditBlockReason,
    t,
    timingSession,
  ]);

  return {
    isSplittingSubtitle,
    isRollingBack,
    hasUndoableOps,
    undoCountdown,
    structuralEditBlockReason,
    splitAvailability,
    splitDisabled,
    undoDisabled,
    handleUndoCancel,
    handleRollbackLatest,
    handleSubtitleSplit,
  };
}
