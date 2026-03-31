'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';

import type { ConvertObj } from '@/shared/components/video-editor/types';

import type {
  VideoEditorDetailReloadAction,
  VideoEditorDetailReloadOptions,
  VideoEditorDetailReloadResult,
} from '../../video-editor-reload-contract';
import { fetchWithTimeout } from '../network/fetch-with-timeout';
import {
  createVideoEditorBootstrapState,
  resolveVideoEditorBootstrapFailure,
  resolveVideoEditorBootstrapSuccess,
  selectVisibleVideoEditorBootstrapState,
  startVideoEditorBootstrapRequest,
} from './video-editor-bootstrap-state';

const BOOTSTRAP_FETCH_TIMEOUT_MS = 15_000;

type TranslateFn = (key: string) => string;

type UseVideoEditorBootstrapArgs = {
  convertId: string;
  t: TranslateFn;
  setConvertObj: Dispatch<SetStateAction<ConvertObj | null>>;
};

type UseVideoEditorBootstrapResult = {
  isLoading: boolean;
  error: string | null;
  videoSource: Record<string, any> | null;
  loadedTaskMainItem: {
    status?: unknown;
    errorMessage?: unknown;
    progress?: unknown;
    currentStep?: unknown;
  } | null;
  reloadConvertDetail: VideoEditorDetailReloadAction;
};

export function useVideoEditorBootstrap(args: UseVideoEditorBootstrapArgs): UseVideoEditorBootstrapResult {
  const { convertId, t, setConvertObj } = args;
  const [bootstrapState, setBootstrapState] = useState(() => createVideoEditorBootstrapState(convertId));
  const requestIdRef = useRef(0);
  const bootstrapAbortRef = useRef<AbortController | null>(null);
  const latestRequestRef = useRef({
    requestId: 0,
    convertId,
  });
  latestRequestRef.current.convertId = convertId;

  const reloadConvertDetail = useCallback<VideoEditorDetailReloadAction>(async (options?: VideoEditorDetailReloadOptions) => {
    const mode: VideoEditorDetailReloadResult['mode'] = options?.silent ? 'background' : 'blocking';
    if (!convertId) return { ok: false, error: null, mode };

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    latestRequestRef.current = {
      requestId,
      convertId,
    };
    bootstrapAbortRef.current?.abort();
    const abortController = new AbortController();
    bootstrapAbortRef.current = abortController;

    if (mode === 'blocking') {
      setConvertObj(null);
    }
    setBootstrapState((prev) =>
      startVideoEditorBootstrapRequest(prev, {
        requestId,
        convertId,
        mode,
      })
    );

    try {
      const response = await fetchWithTimeout(`/api/video-task/editVideoAudiosubtitleDetail?taskMainId=${convertId}`, {
        signal: abortController.signal,
        timeoutMs: BOOTSTRAP_FETCH_TIMEOUT_MS,
      });
      if (!response.ok) throw new Error(t('error.fetchFailed'));

      const result = await response.json();
      if (result.code !== '0' || !result.taskMainItem) {
        throw new Error(result.msg || t('error.dataFormatError'));
      }

      if (latestRequestRef.current.requestId !== requestId || latestRequestRef.current.convertId !== convertId) {
        return { ok: false, error: null, mode };
      }

      setConvertObj({
        ...result.taskMainItem,
        r2preUrl: result.publicBaseUrl,
        env: result.env,
      });
      setBootstrapState((prev) =>
        resolveVideoEditorBootstrapSuccess(prev, {
          requestId,
          convertId,
          videoSource: result.videoItem ?? null,
          loadedTaskMainItem: result.taskMainItem,
        })
      );
      return { ok: true, error: null, mode };
    } catch (err) {
      if (typeof err === 'object' && err !== null && 'name' in err && err.name === 'AbortError') {
        return { ok: false, error: null, mode };
      }
      if (latestRequestRef.current.requestId !== requestId || latestRequestRef.current.convertId !== convertId) {
        return { ok: false, error: null, mode };
      }

      if (mode === 'blocking') {
        setConvertObj(null);
      }
      const error = err instanceof Error ? err.message : t('error.fetchFailed');
      setBootstrapState((prev) =>
        resolveVideoEditorBootstrapFailure(prev, {
          requestId,
          convertId,
          error,
        })
      );
      return { ok: false, error: err instanceof Error ? err.message : t('error.fetchFailed'), mode };
    } finally {
      if (bootstrapAbortRef.current === abortController) {
        bootstrapAbortRef.current = null;
      }
    }
  }, [convertId, setConvertObj, t]);

  useEffect(() => {
    if (!convertId) return;
    void reloadConvertDetail();
    return () => {
      bootstrapAbortRef.current?.abort();
      bootstrapAbortRef.current = null;
    };
  }, [convertId, reloadConvertDetail]);

  const visibleState = useMemo(() => selectVisibleVideoEditorBootstrapState(bootstrapState, convertId), [bootstrapState, convertId]);

  return {
    isLoading: visibleState.isLoading,
    error: visibleState.error,
    videoSource: visibleState.videoSource,
    loadedTaskMainItem: visibleState.loadedTaskMainItem,
    reloadConvertDetail,
  };
}
