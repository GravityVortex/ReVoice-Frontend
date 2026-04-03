'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, type Dispatch, type SetStateAction } from 'react';
import { toast } from 'sonner';

import type { ConvertObj } from '@/shared/components/video-editor/types';

import { fetchWithTimeout, isAbortLikeError } from '../network/fetch-with-timeout';
import { buildVideoEditorTimingSession, type VideoEditorTimingSession } from './video-editor-timing-session';
import {
  buildPendingTimingPersistItems,
  reconcileTimingAfterRollback,
  remapTimingSubtitleIdAfterPersist,
  resolveTimingPersistSuccess,
} from './timing-persist-controller';
import {
  createInitialTimingSessionState,
  timingSessionReducer,
  type TimingPersistReason,
} from './timing-session-owner';

const TIMING_SAVE_TIMEOUT_MS = 15_000;

type UseVideoEditorTimingSessionArgs = {
  convertId: string;
  locale: string;
  convertObj: ConvertObj | null;
  pendingTimingMap: Record<string, { startMs: number; endMs: number }>;
  pendingTimingCount: number;
  setPendingTimingMap: Dispatch<SetStateAction<Record<string, { startMs: number; endMs: number }>>>;
  setConvertObj: Dispatch<SetStateAction<ConvertObj | null>>;
};

export function useVideoEditorTimingSession(args: UseVideoEditorTimingSessionArgs): VideoEditorTimingSession {
  const { convertId, locale, convertObj, pendingTimingMap, pendingTimingCount, setPendingTimingMap, setConvertObj } = args;
  const [ownerState, dispatchOwner] = useReducer(timingSessionReducer, undefined, createInitialTimingSessionState);
  const autoSaveTimingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timingSaveAbortRef = useRef<AbortController | null>(null);
  const activeTaskIdRef = useRef<string | null>(null);
  const pendingTimingMapRef = useRef(pendingTimingMap);
  const convertRowsRef = useRef<any[]>([]);

  pendingTimingMapRef.current = pendingTimingMap;
  convertRowsRef.current = Array.isArray(convertObj?.srt_convert_arr) ? ((convertObj?.srt_convert_arr as any[]) ?? []) : [];

  useEffect(() => {
    activeTaskIdRef.current = convertId || null;
    dispatchOwner({ type: 'reset_for_convert' });
    if (autoSaveTimingRef.current) {
      clearTimeout(autoSaveTimingRef.current);
      autoSaveTimingRef.current = null;
    }
    timingSaveAbortRef.current?.abort();
    timingSaveAbortRef.current = null;
    // Low Fix #11: Clear pending timing map on convertId change
    pendingTimingMapRef.current = {};
  }, [convertId]);

  useEffect(() => {
    return () => {
      if (autoSaveTimingRef.current) {
        clearTimeout(autoSaveTimingRef.current);
        autoSaveTimingRef.current = null;
      }
      timingSaveAbortRef.current?.abort();
      timingSaveAbortRef.current = null;
    };
  }, []);

  const persistTimingItems = useCallback(
    async (
      items: Array<{ id: string; startMs: number; endMs: number }>,
      options?: { reason?: TimingPersistReason; silent?: boolean }
    ) => {
      if (items.length === 0) return true;

      const taskId = convertId;
      const reason = options?.reason ?? 'manual';
      if (reason === 'autosave') {
        dispatchOwner({ type: 'autosave_start' });
      } else {
        dispatchOwner({ type: 'persist_start', reason });
      }

      // High Fix #7: Wait for old request to abort before creating new controller
      if (timingSaveAbortRef.current) {
        timingSaveAbortRef.current.abort();
        // Wait for old request to be aborted (max 100ms)
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const abortController = new AbortController();
      timingSaveAbortRef.current = abortController;

      try {
        const resp = await fetchWithTimeout('/api/video-task/update-subtitle-timings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: convertId, stepName: 'translate_srt', items }),
          signal: abortController.signal,
          timeoutMs: TIMING_SAVE_TIMEOUT_MS,
        });
        const back = await resp.json().catch(() => null);
        if (activeTaskIdRef.current !== taskId) return false;

        if (!resp.ok || back?.code !== 0) {
          const message = back?.message || back?.msg || (locale === 'zh' ? '保存时间轴失败' : 'Failed to save timeline');
          dispatchOwner({
            type: 'persist_failed',
            errorMessage: message,
          });
          if (!options?.silent) {
            toast.error(message);
          }
          return false;
        }

        const resolution = resolveTimingPersistSuccess({
          currentPendingTimingMap: pendingTimingMapRef.current,
          requestedItems: items,
          response: back,
          convertRows: convertRowsRef.current,
          nowMs: Date.now(),
        });

        setConvertObj((prevObj) => {
          if (!prevObj) return prevObj;
          return {
            ...prevObj,
            srt_convert_arr: resolution.nextConvertRows,
          };
        });
        setPendingTimingMap((prev) =>
          resolveTimingPersistSuccess({
            currentPendingTimingMap: prev,
            requestedItems: items,
            response: back,
            convertRows: convertRowsRef.current,
            nowMs: resolution.persistedAtMs,
          }).nextPendingTimingMap
        );
        dispatchOwner({
          type: 'persist_success',
          idMap: resolution.nextIdMap,
          persistedAtMs: resolution.persistedAtMs,
        });
        return true;
      } catch (error) {
        if (activeTaskIdRef.current !== taskId) return false;
        const message = locale === 'zh' ? '保存时间轴失败' : 'Failed to save timeline';
        dispatchOwner({
          type: 'persist_failed',
          errorMessage: message,
        });
        if (!options?.silent && !isAbortLikeError(error)) {
          toast.error(message);
        }
        return false;
      } finally {
        if (timingSaveAbortRef.current === abortController) {
          timingSaveAbortRef.current = null;
        }
      }
    },
    [convertId, locale, setConvertObj, setPendingTimingMap]
  );

  useEffect(() => {
    if (Object.keys(pendingTimingMap).length === 0) return;
    if (autoSaveTimingRef.current) clearTimeout(autoSaveTimingRef.current);
    autoSaveTimingRef.current = setTimeout(async () => {
      autoSaveTimingRef.current = null;
      const currentPendingTimingMap = pendingTimingMapRef.current;
      const items = buildPendingTimingPersistItems(currentPendingTimingMap);
      try {
        await persistTimingItems(items, { silent: true, reason: 'autosave' });
      } catch {
        /* best-effort */
      }
    }, 3000);

    return () => {
      if (autoSaveTimingRef.current) clearTimeout(autoSaveTimingRef.current);
    };
  }, [pendingTimingMap, persistTimingItems]);

  const flushPendingTimings = useCallback(async () => {
    // P0 Fix #1: Force immediate persistence by canceling debounce
    if (autoSaveTimingRef.current) {
      clearTimeout(autoSaveTimingRef.current);
      autoSaveTimingRef.current = null;
    }
    const currentPendingTimingMap = pendingTimingMapRef.current;
    if (Object.keys(currentPendingTimingMap).length === 0) return true;
    const items = buildPendingTimingPersistItems(currentPendingTimingMap);
    return persistTimingItems(items, { silent: false, reason: 'manual' });
  }, [persistTimingItems]);

  const persistPendingTimingsIfNeeded = useCallback(
    async (options?: { reason?: TimingPersistReason; silent?: boolean }) => {
      // P0 Fix #1: Flush debounced timings before checking
      await flushPendingTimings();

      // High Fix #4: Check if flush already persisted everything
      const currentPendingTimingMap = pendingTimingMapRef.current;
      if (Object.keys(currentPendingTimingMap).length === 0) {
        return true; // flush already persisted all timings
      }

      // If there are still pending timings (added during flush), persist them
      const items = buildPendingTimingPersistItems(currentPendingTimingMap);
      return persistTimingItems(items, options);
    },
    [flushPendingTimings, persistTimingItems]
  );

  const reconcilePendingTimingAfterRollback = useCallback(
    (restoredRows: Array<{ id?: string; start?: string; end?: string }>) => {
      dispatchOwner({ type: 'rollback_start' });
      setPendingTimingMap((prev) =>
        reconcileTimingAfterRollback({
          currentPendingTimingMap: prev,
          restoredRows,
        })
      );
      dispatchOwner({ type: 'rollback_finish' });
    },
    [setPendingTimingMap]
  );

  const remapSubtitleIdAfterTimingSave = useCallback(
    (subtitleId: string) => remapTimingSubtitleIdAfterPersist(subtitleId, ownerState.latestPersistIdMap),
    [ownerState.latestPersistIdMap]
  );

  return useMemo(
    () =>
      buildVideoEditorTimingSession({
        state: {
          pendingTimingMap,
          pendingTimingCount,
          phase: ownerState.phase,
          latestPersistIdMap: ownerState.latestPersistIdMap,
          lastPersistError: ownerState.lastPersistError,
          lastPersistedAtMs: ownerState.lastPersistedAtMs,
          convertObj,
        },
        actions: {
          persistPendingTimingsIfNeeded,
          reconcilePendingTimingAfterRollback,
          remapSubtitleIdAfterTimingSave,
          flushPendingTimings,
        },
      }),
    [
      convertObj,
      flushPendingTimings,
      ownerState.lastPersistError,
      ownerState.lastPersistedAtMs,
      ownerState.latestPersistIdMap,
      ownerState.phase,
      pendingTimingCount,
      pendingTimingMap,
      persistPendingTimingsIfNeeded,
      reconcilePendingTimingAfterRollback,
      remapSubtitleIdAfterTimingSave,
    ]
  );
}
