'use client';

import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { HeadphoneOff, Loader2, RefreshCw, Scissors, Search, Sparkles, Square } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { ErrorBlock } from '@/shared/blocks/common/error-state';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { ConvertObj } from '@/shared/components/video-editor/types';
import { useAppContext } from '@/shared/contexts/app';
import { deriveSubtitleVoiceUiState, shouldBlockVoicePlayback, type SubtitleVoiceUiState } from '@/shared/lib/subtitle-voice-state';
import { cn } from '@/shared/lib/utils';

import { resolveEditorPublicAudioUrl } from './audio-source-resolver';
import { isPlayableEditorAudioUrl } from './audio-url-utils';
import type { EditorTransportSnapshot } from './editor-transport';
import { fetchWithTimeout, isAbortLikeError } from './runtime/network/fetch-with-timeout';
import { pollSubtitleJob } from './subtitle-job-poll';
import { mergeLoadedSubtitleItems } from './subtitle-editor-state';
import { SubtitleRowData, SubtitleRowItem } from './subtitle-row-item';
import type { VideoEditorBoundDetailReloadAction } from './video-editor-reload-contract';
import {
  getPendingSourceSaveEntries,
  hasSubtitleWorkstationDirtyState,
  remapSubtitleIdRecordBySourceId,
  remapSubtitleIdSetBySourceId,
  resolveLinkedSourceId,
  shouldApplySubtitleAsyncResult,
} from './subtitle-workstation-state';

const SOURCE_TEXT_SAVE_TIMEOUT_MS = 15_000;
const WORKSTATION_REQUEST_TIMEOUT_MS = 15_000;

interface SubtitleWorkstationProps {
  onPlayingIndexChange?: (index: number) => void;
  onPendingChangesChange?: (pendingCount: number) => void;
  // 提供给父组件：本地“已应用但未重新合成”的字幕段及其应用时间（用于和最近一次合成基线做比较）
  onPendingVoiceIdsChange?: (ids: Array<{ id: string; updatedAtMs: number }>) => void;
  // 提供给父组件：当前文本与可播放配音不匹配的字幕段 id（用于主播放链阻断）
  onPlaybackBlockedVoiceIdsChange?: (ids: string[]) => void;
  // 父组件的最新合成完成时间：用于工作台清空“已应用待合成”的本地状态
  lastMergedAtMs?: number;
  // 合成任务启动回调：父组件用 jobId 追踪合成进度，刷新后也能恢复
  onVideoMergeStarted?: (args: { jobId: string; createdAtMs: number }) => void;

  // Audition Playback API
  onRequestAuditionPlay?: (index: number, mode: 'source' | 'convert') => void;
  onRequestAuditionToggle?: () => void;
  onRequestAuditionStop?: () => void;
  transportSnapshot: EditorTransportSnapshot;
  onToggleAutoPlayNext?: (val: boolean) => void;

  convertObj: ConvertObj | null;
  onSeekToSubtitle?: (time: number) => void;
  onShowTip?: () => void;
  onUpdateSubtitleAudioUrl?: (id: string, audioUrl: string, previewAudioUrl?: string) => void;
  onSubtitleTextChange?: (id: string, text: string) => void;
  onSourceSubtitleTextChange?: (sourceId: string, text: string) => void;
  onSubtitleVoiceStatusChange?: (id: string, voiceStatus: string, needsTts: boolean) => void;
  onDirtyStateChange?: (isDirty: boolean) => void;
  onResetTiming?: (id: string, sourceId: string, startMs: number, endMs: number) => void;
  onReloadFromServer?: VideoEditorBoundDetailReloadAction;
}

export interface SubtitleWorkstationHandle {
  prepareForVideoMerge: () => Promise<boolean>;
  prepareForStructuralEdit: () => Promise<boolean>;
  onVideoSaveClick: () => Promise<boolean>;
  scrollToItem: (id: string) => void;
  commitPreviewSubtitleText: (id: string, text: string) => boolean;
}

export const SubtitleWorkstation = memo(
  forwardRef<SubtitleWorkstationHandle, SubtitleWorkstationProps>(
    (
      {
        onPlayingIndexChange,
        onPendingChangesChange,
        onPendingVoiceIdsChange,
        onPlaybackBlockedVoiceIdsChange,
        lastMergedAtMs,
        onVideoMergeStarted,
        onRequestAuditionPlay,
        onRequestAuditionToggle,
        onRequestAuditionStop,
        transportSnapshot,
        onToggleAutoPlayNext,
        convertObj,
        onSeekToSubtitle,
        onShowTip,
        onUpdateSubtitleAudioUrl,
        onSubtitleTextChange,
        onSourceSubtitleTextChange,
        onSubtitleVoiceStatusChange,
        onDirtyStateChange,
        onResetTiming,
        onReloadFromServer,
      },
      ref
    ) => {
      const locale = useLocale();
      const t = useTranslations('video_convert.videoEditor.audioList');
      const tCommon = useTranslations('common');
      const { fetchUserCredits } = useAppContext();
      const playingSubtitleIndex = transportSnapshot.activeTimelineClipIndex;
      const auditionPlayingIndex = transportSnapshot.activeAuditionClipIndex ?? -1;
      const auditionActiveType = transportSnapshot.auditionMode;
      const isMediaPlaying = transportSnapshot.playbackStatus === 'playing';
      const isAutoPlayNext = transportSnapshot.autoPlayNext;

      // State
      const [subtitleItems, setSubtitleItems] = useState<SubtitleRowData[]>([]);
      const [pendingAppliedVoiceMap, setPendingAppliedVoiceMap] = useState<Record<string, number>>({});
      const [selectedId, setSelectedId] = useState<string | null>(null);
      const [isLoading, setIsLoading] = useState(false);
      const [error, setError] = useState<string | null>(null);
      const [convertingMap, setConvertingMap] = useState<Record<string, string>>({});
      const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
      const [invalidatedDraftAudioIds, setInvalidatedDraftAudioIds] = useState<Set<string>>(() => new Set());
      const [textPreparedForVoiceIds, setTextPreparedForVoiceIds] = useState<Set<string>>(() => new Set());
      const [pendingSourceSaveMap, setPendingSourceSaveMap] = useState<Record<string, number>>({});
      const [blockedPreviewHintId, setBlockedPreviewHintId] = useState<string | null>(null);
      const [focusConvertedEditorId, setFocusConvertedEditorId] = useState<string | null>(null);
      const [searchText, setSearchText] = useState('');
      const [showOnlySplitPending, setShowOnlySplitPending] = useState(false);
      const [isRefreshing, setIsRefreshing] = useState(false);

      // Refs
      const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
      const activeTaskIdRef = useRef<string | null>(null);
      const subtitleItemsRef = useRef<SubtitleRowData[]>([]);
      const scrollToItemTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
      const scrollIntoViewRafRef = useRef<number | null>(null);
      const localStateTaskIdRef = useRef<string | null>(null);
      const resumedJobsRef = useRef<Set<string>>(new Set());
      const ttsWarmupTaskIdRef = useRef<string | null>(null);
      const rootRef = useRef<HTMLDivElement>(null);
      const autoSaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
      const autoSaveSourceTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
      const sourceSaveInflightRef = useRef<Record<string, { editedAtMs: number; promise: Promise<boolean> }>>({});
      const sourceSaveAbortRef = useRef<Record<string, AbortController>>({});
      const lastClearedMergedAtMsRef = useRef(0);

      const debouncedAutoSaveText = useCallback(
        (subtitleId: string, text: string, editedAtMs: number) => {
          if (!convertObj) return;
          const taskId = convertObj.id;
          clearTimeout(autoSaveTimersRef.current[subtitleId]);
          autoSaveTimersRef.current[subtitleId] = setTimeout(() => {
            delete autoSaveTimersRef.current[subtitleId];
            if (activeTaskIdRef.current !== taskId) return;
            fetch('/api/video-task/auto-save-draft', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ taskId, subtitleId, draftTxt: text, editedAtMs }),
            }).catch(() => {
              /* best-effort */
            });
          }, 1500);
        },
        [convertObj]
      );

      const persistSourceTextNow = useCallback(
        async (subtitleId: string, text: string, editedAtMs: number, silent: boolean) => {
          if (!convertObj) return false;
          const taskId = convertObj.id;

          const inflight = sourceSaveInflightRef.current[subtitleId];
          if (inflight && inflight.editedAtMs === editedAtMs) {
            return inflight.promise;
          }

          const currentAbortController = sourceSaveAbortRef.current[subtitleId];
          currentAbortController?.abort();

          if (inflight && inflight.editedAtMs !== editedAtMs) {
            await inflight.promise.catch(() => false);
          }

          const abortController = new AbortController();
          sourceSaveAbortRef.current[subtitleId] = abortController;

          const promise = fetchWithTimeout('/api/video-task/auto-save-source-text', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId, subtitleId, text }),
            signal: abortController.signal,
            timeoutMs: SOURCE_TEXT_SAVE_TIMEOUT_MS,
          })
            .then(async (resp) => {
              const back = await resp.json().catch(() => null);
              if (!resp.ok || back?.code !== 0) {
                throw new Error(back?.message || 'auto save source text failed');
              }
              if (activeTaskIdRef.current !== taskId) return false;
              setPendingSourceSaveMap((prev) => {
                if (prev[subtitleId] !== editedAtMs) return prev;
                const next = { ...prev };
                delete next[subtitleId];
                return next;
              });
              return true;
            })
            .catch((error: unknown) => {
              if (activeTaskIdRef.current !== taskId) return false;
              if (!silent && !isAbortLikeError(error)) {
                toast.error(t('toast.sourceSaveFailed'));
              }
              return false;
            })
            .finally(() => {
              const current = sourceSaveInflightRef.current[subtitleId];
              if (current?.promise === promise) {
                delete sourceSaveInflightRef.current[subtitleId];
              }
              if (sourceSaveAbortRef.current[subtitleId] === abortController) {
                delete sourceSaveAbortRef.current[subtitleId];
              }
            });

          sourceSaveInflightRef.current[subtitleId] = {
            editedAtMs,
            promise,
          };

          return promise;
        },
        [convertObj, t]
      );

      const debouncedAutoSaveSourceText = useCallback(
        (subtitleId: string, text: string, editedAtMs: number) => {
          if (!convertObj) return;
          const taskId = convertObj.id;
          clearTimeout(autoSaveSourceTimersRef.current[subtitleId]);
          autoSaveSourceTimersRef.current[subtitleId] = setTimeout(() => {
            delete autoSaveSourceTimersRef.current[subtitleId];
            if (activeTaskIdRef.current !== taskId) return;
            void persistSourceTextNow(subtitleId, text, editedAtMs, true);
          }, 1500);
        },
        [convertObj, persistSourceTextNow]
      );

      useEffect(() => {
        activeTaskIdRef.current = convertObj?.id ?? null;
      }, [convertObj?.id]);

      useEffect(() => {
        subtitleItemsRef.current = subtitleItems;
      }, [subtitleItems]);

      useEffect(() => {
        const saveTimers = autoSaveTimersRef.current;
        const sourceTimers = autoSaveSourceTimersRef.current;
        Object.values(saveTimers).forEach(clearTimeout);
        Object.values(sourceTimers).forEach(clearTimeout);
        if (scrollToItemTimerRef.current) {
          clearTimeout(scrollToItemTimerRef.current);
          scrollToItemTimerRef.current = null;
        }
        if (scrollIntoViewRafRef.current != null) {
          cancelAnimationFrame(scrollIntoViewRafRef.current);
          scrollIntoViewRafRef.current = null;
        }
        Object.values(sourceSaveAbortRef.current).forEach((controller) => controller.abort());
        autoSaveTimersRef.current = {};
        autoSaveSourceTimersRef.current = {};
        sourceSaveInflightRef.current = {};
        sourceSaveAbortRef.current = {};
      }, [convertObj?.id]);

      useEffect(() => {
        const saveTimers = autoSaveTimersRef.current;
        const sourceTimers = autoSaveSourceTimersRef.current;
        return () => {
          Object.values(saveTimers).forEach(clearTimeout);
          Object.values(sourceTimers).forEach(clearTimeout);
          if (scrollToItemTimerRef.current) {
            clearTimeout(scrollToItemTimerRef.current);
            scrollToItemTimerRef.current = null;
          }
          if (scrollIntoViewRafRef.current != null) {
            cancelAnimationFrame(scrollIntoViewRafRef.current);
            scrollIntoViewRafRef.current = null;
          }
          Object.values(sourceSaveAbortRef.current).forEach((controller) => controller.abort());
          sourceSaveAbortRef.current = {};
        };
      }, []);

      const buildDraftPreviewUrl = useCallback((pathName: string, cacheBust: string | number) => {
        const base = pathName.split('?')[0];
        return `${base}?t=${cacheBust}`;
      }, []);

      const buildPublicAudioUrl = useCallback(
        (pathName: string, cacheBust: string | number) => {
          const resolvedUrl = resolveEditorPublicAudioUrl({
            convertObj,
            pathName,
            cacheBust,
          });
          if (!isPlayableEditorAudioUrl(resolvedUrl)) return '';
          return resolvedUrl;
        },
        [convertObj]
      );

      const deriveRowVoiceUiState = useCallback(
        (item: SubtitleRowData): SubtitleVoiceUiState => {
          return deriveSubtitleVoiceUiState({
            persistedText: item.persistedText_convert ?? '',
            effectiveText: item.text_convert ?? '',
            persistedAudioPath: item.audioUrl_convert,
            voiceStatus: item.voiceStatus,
            needsTts: item.needsTts,
            splitParentId: item.splitParentId,
            splitOperationId: item.splitOperationId,
            draftAudioPath: item.draftAudioPath,
            customDraftAudioPath: item.audioUrl_convert_custom,
            isProcessing: Boolean(convertingMap[item.id]),
            isSaving: savingIds.has(item.id),
            isDraftAudioInvalidated: invalidatedDraftAudioIds.has(item.id),
            isTextPreparedForVoice: textPreparedForVoiceIds.has(item.id),
          });
        },
        [convertingMap, invalidatedDraftAudioIds, savingIds, textPreparedForVoiceIds]
      );

      type PendingJob = {
        subtitleId: string;
        type: 'gen_srt' | 'translate_srt';
        jobId: string;
        requestKey?: string;
        requestTextSnapshot?: string;
      };

      const applySubtitleItemUpdate = useCallback(
        (nextItem: SubtitleRowData, previousItemOverride?: SubtitleRowData | null) => {
          const previousItem =
            previousItemOverride ?? subtitleItemsRef.current.find((current) => current.id === nextItem.id) ?? null;
          if (!previousItem) return false;

          const textConvertChanged = nextItem.text_convert !== previousItem.text_convert;
          const textSourceChanged = nextItem.text_source !== previousItem.text_source;
          const hasExistingDraftAudio = Boolean(previousItem.draftAudioPath || previousItem.audioUrl_convert_custom);

          if (!textConvertChanged && !textSourceChanged) return false;

          setSubtitleItems((prev) => prev.map((current) => (current.id === nextItem.id ? { ...current, ...nextItem } : current)));

          if (textConvertChanged && hasExistingDraftAudio) {
            setInvalidatedDraftAudioIds((prev) => {
              const next = new Set(prev);
              next.add(nextItem.id);
              return next;
            });
          }

          if (textConvertChanged) {
            const editedAtMs = Date.now();
            onSubtitleTextChange?.(nextItem.id, nextItem.text_convert);
            debouncedAutoSaveText(nextItem.id, nextItem.text_convert, editedAtMs);
          }

          if (textSourceChanged) {
            const sourceId = resolveLinkedSourceId(nextItem);
            const editedAtMs = Date.now();
            if (sourceId) {
              setPendingSourceSaveMap((prev) => ({ ...prev, [sourceId]: editedAtMs }));
              onSourceSubtitleTextChange?.(sourceId, nextItem.text_source);
              debouncedAutoSaveSourceText(sourceId, nextItem.text_source, editedAtMs);
            }
          }

          return true;
        },
        [debouncedAutoSaveSourceText, debouncedAutoSaveText, onSourceSubtitleTextChange, onSubtitleTextChange]
      );

      const handleRefreshClick = useCallback(async () => {
        if (!onReloadFromServer || isRefreshing) return;
        setIsRefreshing(true);
        try {
          const result = await onReloadFromServer();
          if (result?.ok === false && result.mode === 'background' && result.error) {
            toast.error(locale === 'zh' ? '刷新失败，当前仍显示旧数据' : 'Refresh failed. Showing the last synced data.');
          }
        } finally {
          setIsRefreshing(false);
        }
      }, [isRefreshing, locale, onReloadFromServer]);

      const commitPreviewSubtitleText = useCallback(
        (id: string, text: string) => {
          if (convertingMap[id] || savingIds.has(id)) return false;
          const currentItem = subtitleItemsRef.current.find((item) => item.id === id);
          if (!currentItem) return false;

          return applySubtitleItemUpdate(
            {
              ...currentItem,
              text_convert: text,
            },
            currentItem
          );
        },
        [applySubtitleItemUpdate, convertingMap, savingIds]
      );

      async function resumePendingJob(job: PendingJob) {
        if (!convertObj) return;
        const taskId = convertObj.id;
        const resumeKey = `${taskId}:${job.type}:${job.jobId}`;
        if (resumedJobsRef.current.has(resumeKey)) return;
        resumedJobsRef.current.add(resumeKey);

        setConvertingMap((prev) => ({
          ...prev,
          [job.subtitleId]: job.type,
        }));

        try {
          const resolvedData = await pollSubtitleJob({
            taskId,
            subtitleName: job.subtitleId,
            type: job.type,
            jobId: job.jobId,
            requestKey: job.requestKey,
            failureMessage: t('toast.generateFailed'),
          });
          if (activeTaskIdRef.current !== taskId) return;
          const newTime = Date.now();
          if (job.type === 'gen_srt') {
            const currentItem = subtitleItemsRef.current.find((itm) => itm.id === job.subtitleId);
            if (
              !currentItem ||
              !shouldApplySubtitleAsyncResult({
                currentText: currentItem.text_source ?? '',
                requestTextSnapshot: job.requestTextSnapshot ?? '',
              })
            ) {
              return;
            }
            setSubtitleItems((prev) =>
              prev.map((itm) =>
                itm.id === job.subtitleId
                  ? {
                      ...itm,
                      text_convert: resolvedData.text_translated,
                      voiceStatus: 'missing',
                      needsTts: true,
                    }
                  : itm
              )
            );
            onSubtitleTextChange?.(job.subtitleId, resolvedData.text_translated);
            setTextPreparedForVoiceIds((prev) => {
              const next = new Set(prev);
              next.add(job.subtitleId);
              return next;
            });
            setInvalidatedDraftAudioIds((prev) => {
              const next = new Set(prev);
              next.add(job.subtitleId);
              return next;
            });
            onSubtitleVoiceStatusChange?.(job.subtitleId, 'missing', true);
          }

          if (job.type === 'translate_srt') {
            const currentItem = subtitleItemsRef.current.find((itm) => itm.id === job.subtitleId);
            if (
              !currentItem ||
              !shouldApplySubtitleAsyncResult({
                currentText: currentItem.text_convert ?? '',
                requestTextSnapshot: job.requestTextSnapshot ?? '',
              })
            ) {
              return;
            }
            setSubtitleItems((prev) =>
              prev.map((itm) =>
                itm.id === job.subtitleId
                  ? {
                      ...itm,
                      draftAudioPath: resolvedData.path_name,
                      audioUrl_convert_custom: buildDraftPreviewUrl(resolvedData.path_name, newTime),
                      voiceStatus: 'ready',
                      needsTts: false,
                    }
                  : itm
              )
            );
            setInvalidatedDraftAudioIds((prev) => {
              if (!prev.has(job.subtitleId)) return prev;
              const next = new Set(prev);
              next.delete(job.subtitleId);
              return next;
            });
            setSelectedId(job.subtitleId);
            setBlockedPreviewHintId(null);
            setFocusConvertedEditorId(null);
          }

          if (job.type === 'translate_srt' && onUpdateSubtitleAudioUrl) {
            const resolvedPublicAudioUrl = buildPublicAudioUrl(resolvedData.path_name, newTime);
            const playablePreviewAudioUrl = resolvedPublicAudioUrl || '';
            onUpdateSubtitleAudioUrl(job.subtitleId, resolvedPublicAudioUrl, playablePreviewAudioUrl);
          }
          if (job.type === 'translate_srt') {
            const currentItem = subtitleItemsRef.current.find((itm) => itm.id === job.subtitleId);
            onSubtitleVoiceStatusChange?.(job.subtitleId, 'ready', false);
            if (typeof window !== 'undefined' && currentItem) {
              window.requestAnimationFrame(() => {
                window.requestAnimationFrame(() => {
                  if (activeTaskIdRef.current !== taskId) return;
                  onRequestAuditionPlay?.(currentItem.order, 'convert');
                });
              });
            }
          }
        } catch (e) {
          // Silent resume failure: the user will see "generate failed" only if they actively retry.
          console.warn('[subtitle-workstation] resume job failed:', e);
          if (activeTaskIdRef.current === taskId) {
            resumedJobsRef.current.delete(resumeKey);
          }
        } finally {
          if (activeTaskIdRef.current !== taskId) return;
          setConvertingMap((prev) => {
            const next = { ...prev };
            delete next[job.subtitleId];
            return next;
          });
        }
      }

      // --- Data Loading ---
      const loadSrtFiles = async () => {
        if (!convertObj) {
          setError(t('error.missingData', { ns: 'video_convert.videoEditor' }));
          return;
        }
        const currentTaskId = convertObj.id;

        setIsLoading(true);
        setError(null);

        try {
          const sourceArr = convertObj.srt_source_arr || [];
          const convertArr = convertObj.srt_convert_arr || [];
          const maxLength = Math.max(sourceArr.length, convertArr.length);
          const items: SubtitleRowData[] = [];
          const pendingJobs: PendingJob[] = [];
          const now = Date.now();

          for (let i = 0; i < maxLength; i++) {
            const sourceItem = sourceArr[i];
            const convertItem = convertArr[i];
            const sourceId = sourceItem?.id || String(i + 1);
            const convertId = convertItem?.id || sourceId;
            const needsTtsRaw = convertItem?.vap_needs_tts;
            const needsTts = needsTtsRaw === true || needsTtsRaw === 'true' || needsTtsRaw === 1 || needsTtsRaw === '1';

            const ttsUpdatedAtMsRaw = (convertItem as any)?.vap_tts_updated_at_ms;
            const ttsUpdatedAtMs =
              typeof ttsUpdatedAtMsRaw === 'number' ? ttsUpdatedAtMsRaw : Number.parseInt(String(ttsUpdatedAtMsRaw || ''), 10);
            const audioCacheBuster = Number.isFinite(ttsUpdatedAtMs) && ttsUpdatedAtMs > 0 ? String(ttsUpdatedAtMs) : '';

            const normalizedDraftAudioPath =
              typeof convertItem?.vap_draft_audio_path === 'string' && convertItem.vap_draft_audio_path.length > 0
                ? convertItem.vap_draft_audio_path.split('?')[0]
                : '';

            const nextItem: SubtitleRowData = {
              order: i,
              id: convertId,
              sourceId,
              startTime_source: sourceItem?.start || '00:00:00,000',
              endTime_source: sourceItem?.end || '00:00:00,000',
              text_source: sourceItem?.txt || '',
              audioUrl_source: sourceItem?.audio_url || '',
              startTime_convert: convertItem?.start || '00:00:00,000',
              endTime_convert: convertItem?.end || '00:00:00,000',
              text_convert: convertItem?.txt || '',
              persistedText_convert: convertItem?.txt || '',
              audioUrl_convert: convertItem?.audio_url || '',
              voiceStatus: convertItem?.vap_voice_status,
              needsTts,
              splitParentId: convertItem?.vap_split_parent_id as string | undefined,
              splitOperationId: convertItem?.vap_split_operation_id as string | undefined,
              draftAudioPath: normalizedDraftAudioPath || undefined,
              // Stable cache-buster: only changes when voice regeneration succeeds.
              // This keeps playback snappy by allowing browser caching across refreshes.
              newTime: audioCacheBuster,
            };

            // Restore draft outputs from vt_task_subtitle.subtitle_data (no vt_task_main.metadata).
            if (normalizedDraftAudioPath) {
              nextItem.audioUrl_convert_custom = buildDraftPreviewUrl(normalizedDraftAudioPath, audioCacheBuster || now);
            }
            const draftTxt = convertItem?.vap_draft_txt as string | undefined;
            if (draftTxt && typeof draftTxt === 'string') {
              nextItem.text_convert = draftTxt;
            }

            // Resume pending jobs after refresh.
            const trJobId = convertItem?.vap_tr_job_id as string | undefined;
            if (trJobId && typeof trJobId === 'string' && trJobId.length > 0) {
              pendingJobs.push({
                subtitleId: convertId,
                type: 'gen_srt',
                jobId: trJobId,
                requestKey: convertItem?.vap_tr_request_key as string | undefined,
                requestTextSnapshot: nextItem.text_source,
              });
            }
            const ttsJobId = convertItem?.vap_tts_job_id as string | undefined;
            if (ttsJobId && typeof ttsJobId === 'string' && ttsJobId.length > 0) {
              pendingJobs.push({
                subtitleId: convertId,
                type: 'translate_srt',
                jobId: ttsJobId,
                requestKey: convertItem?.vap_tts_request_key as string | undefined,
                requestTextSnapshot: nextItem.text_convert,
              });
            }

            items.push(nextItem);
          }

          if (activeTaskIdRef.current !== currentTaskId) return;
          const shouldReuseLocalState = localStateTaskIdRef.current === currentTaskId;
          const previousItems = subtitleItemsRef.current;

          setSubtitleItems((prev) => (shouldReuseLocalState ? mergeLoadedSubtitleItems(prev, items) : items));
          const validIds = new Set(items.map((item) => item.id));
          if (!shouldReuseLocalState) {
            resumedJobsRef.current.clear();
            lastClearedMergedAtMsRef.current = 0;
            setPendingAppliedVoiceMap({});
            setConvertingMap({});
            setSavingIds(new Set<string>());
            setInvalidatedDraftAudioIds(new Set<string>());
            setTextPreparedForVoiceIds(new Set<string>());
            setPendingSourceSaveMap({});
            setSelectedId(null);
            setBlockedPreviewHintId(null);
            setFocusConvertedEditorId(null);
          } else {
            setPendingAppliedVoiceMap((prev) => {
              return remapSubtitleIdRecordBySourceId(prev, previousItems, items);
            });
            setConvertingMap((prev) => {
              return remapSubtitleIdRecordBySourceId(prev, previousItems, items);
            });
            setSavingIds((prev) => {
              return remapSubtitleIdSetBySourceId(prev, previousItems, items);
            });
            setInvalidatedDraftAudioIds((prev) => {
              return remapSubtitleIdSetBySourceId(prev, previousItems, items);
            });
            setTextPreparedForVoiceIds((prev) => {
              return remapSubtitleIdSetBySourceId(prev, previousItems, items);
            });
          }
          const validSourceIds = new Set(items.map((item) => resolveLinkedSourceId(item)).filter((id) => id.length > 0));
          if (shouldReuseLocalState) {
            setPendingSourceSaveMap((prev) => {
              const next: Record<string, number> = {};
              for (const [id, updatedAtMs] of Object.entries(prev)) {
                if (validSourceIds.has(id)) next[id] = updatedAtMs;
              }
              return next;
            });
            setSelectedId((prev) => {
              if (!prev) return null;
              return Array.from(remapSubtitleIdSetBySourceId(new Set([prev]), previousItems, items))[0] ?? null;
            });
            setBlockedPreviewHintId((prev) => {
              if (!prev) return null;
              return Array.from(remapSubtitleIdSetBySourceId(new Set([prev]), previousItems, items))[0] ?? null;
            });
            setFocusConvertedEditorId((prev) => {
              if (!prev) return null;
              return Array.from(remapSubtitleIdSetBySourceId(new Set([prev]), previousItems, items))[0] ?? null;
            });
          }
          localStateTaskIdRef.current = currentTaskId;
          // Fire-and-forget resume so the UI keeps moving after refresh.
          for (const job of pendingJobs) {
            void resumePendingJob(job);
          }
        } catch (err) {
          if (activeTaskIdRef.current !== currentTaskId) return;
          const errorMessage = err instanceof Error ? err.message : t('loadError');
          setError(errorMessage);
          console.error('Failed to load SRT files:', err);
        } finally {
          if (activeTaskIdRef.current !== currentTaskId) return;
          setIsLoading(false);
        }
      };

      useEffect(() => {
        if (convertObj) {
          loadSrtFiles();
        }
      }, [convertObj]);

      // --- TTS prewarm + keepalive ---
      // 目标：
      // - 用户进入 video-editor 页面时提前触发 GPU 容器冷启动/快照 restore
      // - 用户停留编辑页面期间用轻量 keepalive 防止 scaledown 到 0
      // - 成本控制：用户不活跃/切到后台时自动停止 keepalive
      useEffect(() => {
        if (!convertObj) return;
        if (ttsWarmupTaskIdRef.current === convertObj.id) return;
        ttsWarmupTaskIdRef.current = convertObj.id;

        let stopped = false;
        // 仅当用户在字幕工作台内发生过交互后才开始 keepalive：
        // - 避免“用户只打开页面但什么都没做”时也持续打 /health 造成 GPU 预热成本
        // - 仍保留 prewarm（进入页面时尝试触发一次冷启动/快照 restore）
        const hasEverInteractedRef = { value: false };
        const lastActiveRef = { value: 0 };
        const lastKeepaliveAtRef = { value: 0 };
        // 保证 keepalive 串行：上一次请求未返回时，不再发起新的请求，避免触发模型无意义扩容。
        const keepaliveInflightRef = { value: false };
        const minKeepaliveIntervalMs = 15 * 1000;
        const keepaliveIntervalMs = 60 * 1000;
        let interval: number | null = null;

        const triggerPrewarm = async () => {
          try {
            await fetch('/api/tts/prewarm', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ taskId: convertObj.id }),
            });
          } catch {
            // best-effort
          }
        };

        const tickKeepalive = async () => {
          if (stopped) return;
          if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
          if (!hasEverInteractedRef.value) return;
          // 等待上一次 keepalive 明确返回后再进行下一次调用
          if (keepaliveInflightRef.value) return;
          const idleMs = Date.now() - lastActiveRef.value;
          // 超过 2 分钟不操作就不 keepalive（避免用户挂着页面吃 GPU 成本）
          if (idleMs > 2 * 60 * 1000) {
            if (interval != null) {
              window.clearInterval(interval);
              interval = null;
            }
            return;
          }
          const now = Date.now();
          if (now - lastKeepaliveAtRef.value < minKeepaliveIntervalMs) return;
          keepaliveInflightRef.value = true;
          try {
            await fetch('/api/tts/keepalive', { method: 'POST' });
          } catch {
            // best-effort
          } finally {
            lastKeepaliveAtRef.value = Date.now();
            keepaliveInflightRef.value = false;
          }
        };

        const markActive = () => {
          hasEverInteractedRef.value = true;
          lastActiveRef.value = Date.now();
          // 首次交互后才启动定时 keepalive，避免“纯停留”造成周期性请求。
          if (interval == null) {
            interval = window.setInterval(() => {
              void tickKeepalive();
            }, keepaliveIntervalMs);
          }
          // 用户从“空闲/后台”回到页面时，尽快打一发 keepalive，
          // 避免等到下一次 60s interval 才恢复 runtime，影响“准实时”体验。
          void tickKeepalive();
        };

        const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
        const root = rootRef.current;
        if (root) {
          for (const evt of events) {
            root.addEventListener(evt, markActive, { passive: true });
          }
        }

        const onVisibilityChange = () => {
          if (typeof document === 'undefined') return;
          if (document.visibilityState === 'visible') {
            // 不把“切回前台”直接当作用户编辑行为；
            // 仅在用户曾经交互过时，尝试补打一发 keepalive。
            void tickKeepalive();
          }
        };
        if (typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', onVisibilityChange);
        }

        void triggerPrewarm();
        // 注意：不在 mount 时立刻 keepalive，避免“只打开不操作”也产生周期请求。

        return () => {
          stopped = true;
          if (interval != null) window.clearInterval(interval);
          if (root) {
            for (const evt of events) {
              root.removeEventListener(evt, markActive);
            }
          }
          if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', onVisibilityChange);
          }
        };
      }, [convertObj]);

      // --- Sync with Video Player ---
      useEffect(() => {
        return () => {
          if (scrollIntoViewRafRef.current != null) {
            cancelAnimationFrame(scrollIntoViewRafRef.current);
            scrollIntoViewRafRef.current = null;
          }
        };
      }, [subtitleItems, convertObj?.id]);

      useEffect(() => {
        if (scrollIntoViewRafRef.current != null) {
          cancelAnimationFrame(scrollIntoViewRafRef.current);
          scrollIntoViewRafRef.current = null;
        }
        if (playingSubtitleIndex == null || playingSubtitleIndex < 0) return;
        const el = itemRefs.current[playingSubtitleIndex];
        if (!el) return;
        scrollIntoViewRafRef.current = requestAnimationFrame(() => {
          scrollIntoViewRafRef.current = null;
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        });
        return () => {
          if (scrollIntoViewRafRef.current != null) {
            cancelAnimationFrame(scrollIntoViewRafRef.current);
            scrollIntoViewRafRef.current = null;
          }
        };
      }, [playingSubtitleIndex]);

      useEffect(() => {
        onPlayingIndexChange?.(playingSubtitleIndex);
        if (playingSubtitleIndex >= 0 && subtitleItems[playingSubtitleIndex]) {
          const el = itemRefs.current[playingSubtitleIndex];
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
      }, [playingSubtitleIndex, subtitleItems]);

      useEffect(() => {
        const pendingAppliedVoiceCount = Object.keys(pendingAppliedVoiceMap).length;
        onPendingChangesChange?.(pendingAppliedVoiceCount);
        onPendingVoiceIdsChange?.(Object.entries(pendingAppliedVoiceMap).map(([id, updatedAtMs]) => ({ id, updatedAtMs })));
      }, [onPendingChangesChange, onPendingVoiceIdsChange, pendingAppliedVoiceMap]);

      useEffect(() => {
        if (!onPlaybackBlockedVoiceIdsChange) return;
        onPlaybackBlockedVoiceIdsChange(
          subtitleItems
            .filter((item) => shouldBlockVoicePlayback(deriveRowVoiceUiState(item)))
            .map((item) => item.id)
        );
      }, [deriveRowVoiceUiState, onPlaybackBlockedVoiceIdsChange, subtitleItems]);

      useEffect(() => {
        if (!onDirtyStateChange) return;
        onDirtyStateChange(
          hasSubtitleWorkstationDirtyState({
            rowVoiceStates: subtitleItems.map((item) => deriveRowVoiceUiState(item)),
            pendingAppliedVoiceCount: Object.keys(pendingAppliedVoiceMap).length,
            pendingSourceSaveCount: Object.keys(pendingSourceSaveMap).length,
          })
        );
      }, [deriveRowVoiceUiState, onDirtyStateChange, pendingAppliedVoiceMap, pendingSourceSaveMap, subtitleItems]);

      useEffect(() => {
        const mergedAt = Number(lastMergedAtMs || 0);
        if (!Number.isFinite(mergedAt) || mergedAt <= 0) return;
        const normalizedMergedAt = Math.round(mergedAt);
        if (normalizedMergedAt <= lastClearedMergedAtMsRef.current) return;
        lastClearedMergedAtMsRef.current = normalizedMergedAt;
        setPendingAppliedVoiceMap((prev) => {
          const next: Record<string, number> = {};
          for (const [id, updatedAtMs] of Object.entries(prev)) {
            const ts = Number.isFinite(updatedAtMs) ? Math.round(updatedAtMs) : 0;
            if (ts > normalizedMergedAt) next[id] = ts;
          }
          return next;
        });
      }, [lastMergedAtMs]);

      // --- Audio Playback ---
      const stopPlayback = () => {
        onRequestAuditionStop?.();
      };

      const togglePlayback = (index: number, type: 'source' | 'convert') => {
        const isSameClip = auditionPlayingIndex === index && auditionActiveType === type;
        if (isSameClip) {
          onRequestAuditionToggle?.();
        } else {
          onRequestAuditionPlay?.(index, type);
        }
      };

      // --- Actions ---
      const handleConvert = async (item: SubtitleRowData, type: string, index: number) => {
        if (!convertObj) return;
        const taskId = convertObj.id;
        const requestTextSnapshot = type === 'gen_srt' ? item.text_source : item.text_convert;

        setConvertingMap((prev) => ({
          ...prev,
          [item.id]: type,
        }));
        try {
          let preText = '';
          if (index > 0) {
            const preItem = subtitleItems[index - 1];
            preText = type === 'gen_srt' ? preItem.text_source : preItem.text_convert;
          }

          const url = `/api/video-task/generate-subtitle-voice`;
          const params = {
            text: type === 'gen_srt' ? item.text_source : item.text_convert,
            preText: preText,
            type: type,
            subtitleName: item.id,
            taskId: convertObj.id,
            languageTarget: convertObj.targetLanguage,
          };

          const resp = await fetch(url, {
            method: 'POST',
            body: JSON.stringify(params),
            signal: AbortSignal.timeout(180_000),
          });
          const { code, message, data } = await resp.json();

          if (code === 0) {
            let resolvedData = data;

            // Async job: poll until we get the same payload as the legacy sync API.
            if (data?.status === 'pending' && data?.jobId) {
              const jobId = typeof data?.jobId === 'string' && data.jobId.length > 0 ? (data.jobId as string) : '';
              const requestKey = typeof data?.requestKey === 'string' && data.requestKey.length > 0 ? (data.requestKey as string) : '';
              resolvedData = await pollSubtitleJob({
                taskId,
                subtitleName: item.id,
                type: type as PendingJob['type'],
                jobId,
                requestKey,
                failureMessage: t('toast.generateFailed'),
              });
            }
            if (activeTaskIdRef.current !== taskId) return;
            const currentItem = subtitleItemsRef.current.find((itm) => itm.id === item.id);
            if (
              !currentItem ||
              !shouldApplySubtitleAsyncResult({
                currentText: type === 'gen_srt' ? currentItem.text_source ?? '' : currentItem.text_convert ?? '',
                requestTextSnapshot,
              })
            ) {
              return;
            }

            void fetchUserCredits();
            const newTime = new Date().getTime();
            if (type === 'gen_srt') {
              toast.success(t('toast.translationReadyForVoice'));
              setSubtitleItems((prev) =>
                prev.map((itm) =>
                  itm.id === item.id
                    ? {
                        ...itm,
                        text_convert: resolvedData.text_translated,
                        voiceStatus: 'missing',
                        needsTts: true,
                      }
                    : itm
                )
              );
              onSubtitleTextChange?.(item.id, resolvedData.text_translated);
              setTextPreparedForVoiceIds((prev) => {
                const next = new Set(prev);
                next.add(item.id);
                return next;
              });
              setInvalidatedDraftAudioIds((prev) => {
                const next = new Set(prev);
                next.add(item.id);
                return next;
              });
              onSubtitleVoiceStatusChange?.(item.id, 'missing', true);
            }

            if (type === 'translate_srt') {
              toast.success(t('toast.voiceReadyToPreview'));
              setSubtitleItems((prev) =>
                prev.map((itm) =>
                  itm.id === item.id
                    ? {
                        ...itm,
                        draftAudioPath: resolvedData.path_name,
                        audioUrl_convert_custom: buildDraftPreviewUrl(resolvedData.path_name, newTime),
                        voiceStatus: 'ready',
                        needsTts: false,
                      }
                    : itm
                )
              );
              setInvalidatedDraftAudioIds((prev) => {
                if (!prev.has(item.id)) return prev;
                const next = new Set(prev);
                next.delete(item.id);
                return next;
              });
              setSelectedId(item.id);
              setBlockedPreviewHintId(null);
              setFocusConvertedEditorId(null);
            }

            if (type === 'translate_srt' && onUpdateSubtitleAudioUrl) {
              const resolvedPublicAudioUrl = buildPublicAudioUrl(resolvedData.path_name, newTime);
              const playablePreviewAudioUrl = resolvedPublicAudioUrl || '';
              onUpdateSubtitleAudioUrl(item.id, resolvedPublicAudioUrl, playablePreviewAudioUrl);
            }
            if (type === 'translate_srt') {
              onSubtitleVoiceStatusChange?.(item.id, 'ready', false);
              if (typeof window !== 'undefined') {
                window.requestAnimationFrame(() => {
                  window.requestAnimationFrame(() => {
                    if (activeTaskIdRef.current !== taskId) return;
                    onRequestAuditionPlay?.(item.order, 'convert');
                  });
                });
              }
            }
          } else {
            toast.error(message || t('toast.generateFailed'));
          }
        } catch (e) {
          if (activeTaskIdRef.current !== taskId) return;
          const isTimeout = e instanceof DOMException && e.name === 'TimeoutError';
          toast.error(isTimeout ? t('toast.generateTimeout') : t('toast.generateFailed'));
        } finally {
          if (activeTaskIdRef.current !== taskId) return;
          setConvertingMap((prev) => {
            const next = { ...prev };
            delete next[item.id];
            return next;
          });
        }
      };

      const handleSave = async (item: SubtitleRowData, type: string) => {
        if (!convertObj) return false;
        if (type !== 'translate_srt') return false;
        const taskId = convertObj.id;
        const requestTextSnapshot = item.text_convert;

        const tempArr = item.audioUrl_convert_custom?.split('?') || [];
        const pathName = tempArr.length > 0 ? tempArr[0] : item.audioUrl_convert_custom;
        if (!pathName) {
          toast.error(t('toast.saveFailed'));
          return false;
        }

        setSavingIds((prev) => {
          const next = new Set(prev);
          next.add(item.id);
          return next;
        });

        try {
          const resp = await fetchWithTimeout('/api/video-task/update-subtitle-item', {
            method: 'POST',
            body: JSON.stringify({
              userId: convertObj.userId,
              taskId: convertObj.id,
              type,
              id: item.id,
              pathName,
              item: { id: item.id, txt: item.text_convert },
            }),
            timeoutMs: WORKSTATION_REQUEST_TIMEOUT_MS,
          });
          const { code } = await resp.json();
          if (activeTaskIdRef.current !== taskId) return false;
          if (code === 0) {
            const currentItem = subtitleItemsRef.current.find((itm) => itm.id === item.id);
            if (
              !currentItem ||
              !shouldApplySubtitleAsyncResult({
                currentText: currentItem.text_convert ?? '',
                requestTextSnapshot,
              })
            ) {
              return false;
            }
            toast.success(t('toast.saveSuccess'));
            const savedAt = Date.now();
            const savedAudioPath = `adj_audio_time/${item.id}.wav`;
            setSubtitleItems((prev) =>
              prev.map((itm) =>
                itm.id === item.id
                  ? {
                      ...itm,
                      persistedText_convert: itm.text_convert,
                      text_convert: itm.text_convert,
                      audioUrl_convert: savedAudioPath,
                      draftAudioPath: '',
                      audioUrl_convert_custom: '',
                      voiceStatus: 'ready',
                      needsTts: false,
                      newTime: '' + savedAt,
                    }
                  : itm
              )
            );
            setInvalidatedDraftAudioIds((prev) => {
              if (!prev.has(item.id)) return prev;
              const next = new Set(prev);
              next.delete(item.id);
              return next;
            });
            setTextPreparedForVoiceIds((prev) => {
              if (!prev.has(item.id)) return prev;
              const next = new Set(prev);
              next.delete(item.id);
              return next;
            });
            if (onUpdateSubtitleAudioUrl) {
              onUpdateSubtitleAudioUrl(item.id, buildPublicAudioUrl(savedAudioPath, savedAt));
            }
            onSubtitleVoiceStatusChange?.(item.id, 'ready', false);
            setPendingAppliedVoiceMap((prev) => ({ ...prev, [item.id]: savedAt }));
            onShowTip?.();
            return true;
          } else {
            toast.error(t('toast.saveFailed'));
            return false;
          }
        } catch {
          if (activeTaskIdRef.current !== taskId) return false;
          toast.error(t('toast.saveFailed'));
          return false;
        } finally {
          if (activeTaskIdRef.current !== taskId) return false;
          setSavingIds((prev) => {
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          });
        }
      };

      const scrollToItem = useCallback((id: string) => {
        const taskId = activeTaskIdRef.current;
        if (!taskId) return;
        setSelectedId(id);
        if (scrollToItemTimerRef.current) {
          clearTimeout(scrollToItemTimerRef.current);
        }
        // 等 convertObj 更新后 subtitleItems 重载，再用 ref 滚动
        scrollToItemTimerRef.current = setTimeout(() => {
          scrollToItemTimerRef.current = null;
          if (!taskId || activeTaskIdRef.current !== taskId) return;
          const idx = subtitleItemsRef.current.findIndex((itm) => itm.id === id);
          if (idx < 0) return;
          itemRefs.current[subtitleItemsRef.current[idx].order]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
      }, []);

      const focusMergeBlockingItem = useCallback(
        (id: string) => {
          setBlockedPreviewHintId(id);
          setFocusConvertedEditorId(id);
          scrollToItem(id);
        },
        [scrollToItem]
      );

      const focusPendingSourceSaveItem = useCallback(
        (sourceId: string) => {
          const item = subtitleItems.find((entry) => resolveLinkedSourceId(entry) === sourceId);
          if (!item) return;
          setSelectedId(item.id);
          setFocusConvertedEditorId(null);
          setBlockedPreviewHintId(null);
          scrollToItem(item.id);
        },
        [scrollToItem, subtitleItems]
      );

      const prepareForVideoMerge = async () => {
        if (!convertObj) return false;
        const blockedItem = subtitleItems.find((item) => {
          const state = deriveRowVoiceUiState(item);
          return state === 'stale' || state === 'text_ready' || state === 'processing';
        });
        if (blockedItem) {
          focusMergeBlockingItem(blockedItem.id);
          const blockedState = deriveRowVoiceUiState(blockedItem);
          toast.error(blockedState === 'processing' ? t('toast.mergeBlockedProcessing') : t('toast.mergeBlockedVoice'));
          return false;
        }

        // High Fix #4: Persist pending source text saves before merge
        const pendingSourceEntries = getPendingSourceSaveEntries(subtitleItems, pendingSourceSaveMap);
        for (const entry of pendingSourceEntries) {
          const timer = autoSaveSourceTimersRef.current[entry.sourceId];
          if (timer) {
            clearTimeout(timer);
            delete autoSaveSourceTimersRef.current[entry.sourceId];
          }

          const ok = await persistSourceTextNow(entry.sourceId, entry.text, entry.editedAtMs, false);
          if (!ok) {
            focusPendingSourceSaveItem(entry.sourceId);
            return false;
          }
        }

        const audioReadyItems = subtitleItems.filter((item) => deriveRowVoiceUiState(item) === 'audio_ready');
        for (const item of audioReadyItems) {
          const ok = await handleSave(item, 'translate_srt');
          if (!ok) return false;
        }
        return true;
      };

      const prepareForStructuralEdit = async () => {
        if (!convertObj) return false;

        const blockedItem = subtitleItems.find((item) => {
          const state = deriveRowVoiceUiState(item);
          return state === 'processing' || state === 'audio_ready';
        });
        if (blockedItem) {
          focusMergeBlockingItem(blockedItem.id);
          const blockedState = deriveRowVoiceUiState(blockedItem);
          toast.error(blockedState === 'processing' ? t('toast.mergeBlockedProcessing') : t('toast.mergeBlockedVoice'));
          return false;
        }

        const pendingSourceEntries = getPendingSourceSaveEntries(subtitleItems, pendingSourceSaveMap);
        for (const entry of pendingSourceEntries) {
          const timer = autoSaveSourceTimersRef.current[entry.sourceId];
          if (timer) {
            clearTimeout(timer);
            delete autoSaveSourceTimersRef.current[entry.sourceId];
          }

          const ok = await persistSourceTextNow(entry.sourceId, entry.text, entry.editedAtMs, false);
          if (!ok) {
            focusPendingSourceSaveItem(entry.sourceId);
            return false;
          }
        }

        return true;
      };

      const onVideoSaveClick = async () => {
        if (!convertObj) return false;
        const taskId = convertObj.id;
        // 用“触发合成的时间”作为 lastMergedAtMs 的保守值：
        // - 合成完成后更新为该时间，可确保“合成过程中新增的修改”不会被误判为已合成。
        const mergeTriggeredAtMs = Date.now();
        try {
          const resp = await fetchWithTimeout('/api/video-task/generate-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId }),
            timeoutMs: WORKSTATION_REQUEST_TIMEOUT_MS,
          });
          const { code, message, data } = await resp.json();
          if (activeTaskIdRef.current !== taskId) return false;
          if (code === 0) {
            toast.success(t('toast.videoSaveSuccess'));
            if (data?.status === 'pending') {
              const jobId = typeof data?.jobId === 'string' && data.jobId.length > 0 ? (data.jobId as string) : '';
              onVideoMergeStarted?.({ jobId, createdAtMs: mergeTriggeredAtMs });
            }
            return true;
          } else {
            toast.error(message || t('toast.videoSaveFailed'));
            return false;
          }
        } catch {
          if (activeTaskIdRef.current !== taskId) return false;
          toast.error(t('toast.videoSaveFailed'));
          return false;
        }
      };

      useImperativeHandle(ref, () => ({
        onVideoSaveClick,
        prepareForVideoMerge,
        prepareForStructuralEdit,
        scrollToItem,
        commitPreviewSubtitleText,
      }));

      const srtTimeToMs = (srt: string): number => {
        const [h, m, rest] = srt.split(':');
        const [s, ms] = (rest || '0,0').split(',');
        return (+h * 3600 + +m * 60 + +s) * 1000 + +ms;
      };

      // Time Seconds Helper
      const parseTimeToSeconds = (timeStr: string): number => {
        const parts = timeStr.split(':');
        if (parts.length !== 3) return 0;
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        let seconds = 0,
          ms = 0;
        if (parts[2].includes(',')) {
          const [sec, m] = parts[2].split(',');
          seconds = parseInt(sec, 10);
          ms = parseInt(m, 10);
        } else if (parts[2].includes('.')) {
          const [sec, m] = parts[2].split('.');
          seconds = parseInt(sec, 10);
          ms = parseInt(m, 10);
        } else {
          seconds = parseInt(parts[2], 10);
        }
        return hours * 3600 + minutes * 60 + seconds + ms / 1000;
      };

      const handleSeek = (timeStr: string) => {
        onSeekToSubtitle?.(parseTimeToSeconds(timeStr));
      };

      const pendingSplitCount = useMemo(() => {
        return subtitleItems.filter((item) => {
          if (!(item.splitParentId || item.splitOperationId)) return false;
          const state = deriveRowVoiceUiState(item);
          return state === 'stale' || state === 'text_ready' || state === 'audio_ready';
        }).length;
      }, [deriveRowVoiceUiState, subtitleItems]);

      // 当 split pending 归零时自动关闭筛选
      useEffect(() => {
        if (pendingSplitCount === 0) setShowOnlySplitPending(false);
      }, [pendingSplitCount]);

      const filteredItems = useMemo(() => {
        let base = subtitleItems;
        if (showOnlySplitPending) {
          base = base.filter((item) => Boolean(item.splitParentId || item.splitOperationId));
        }
        const q = searchText.trim().toLowerCase();
        if (!q) return base;
        return base.filter((item) => item.text_source.toLowerCase().includes(q) || item.text_convert.toLowerCase().includes(q));
      }, [searchText, showOnlySplitPending, subtitleItems]);

      const rowVoiceStateById = useMemo(() => {
        const next = new Map<string, SubtitleVoiceUiState>();
        subtitleItems.forEach((item) => {
          next.set(item.id, deriveRowVoiceUiState(item));
        });
        return next;
      }, [deriveRowVoiceUiState, subtitleItems]);

      return (
        <div ref={rootRef} className="bg-background/40 flex h-full flex-col backdrop-blur-sm">
          {/* Toolbar */}
          <div className="bg-card/40 flex items-center justify-between border-b border-white/[0.04] px-3 py-2 backdrop-blur-xl">
            <div className="flex items-center gap-3">
              {Object.keys(pendingAppliedVoiceMap).length > 0 && (
                <span className="text-muted-foreground rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium shadow-sm">
                  {t('pendingChanges', { count: Object.keys(pendingAppliedVoiceMap).length })}
                </span>
              )}
              {pendingSplitCount > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={() => setShowOnlySplitPending((v) => !v)}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                        showOnlySplitPending
                          ? 'border-teal-400/30 bg-teal-400/15 text-teal-300'
                          : 'border-teal-400/20 bg-teal-400/8 text-teal-400/80 hover:bg-teal-400/12 hover:text-teal-300'
                      )}
                    >
                      <Scissors className="size-3" />
                      <span>{pendingSplitCount}</span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t('splitPendingFilter')}</TooltipContent>
                </Tooltip>
              )}
              {isMediaPlaying && auditionPlayingIndex !== undefined && auditionActiveType !== undefined && (
                <div className="bg-primary/10 border-primary/20 animate-in fade-in slide-in-from-top-2 flex items-center gap-2 rounded-full border px-3 py-1.5 duration-300">
                  <div className="flex items-center gap-1">
                    <div className="bg-primary/80 h-3 w-1 animate-[bounce_1s_infinite] rounded-full [animation-delay:-0.3s]"></div>
                    <div className="bg-primary h-4 w-1 animate-[bounce_1s_infinite] rounded-full [animation-delay:-0.15s]"></div>
                    <div className="bg-primary/60 h-2 w-1 animate-[bounce_1s_infinite] rounded-full"></div>
                  </div>

                  {auditionPlayingIndex >= 0 && (
                    <div className="text-primary text-xs font-medium">{t('nowPlaying.row', { num: auditionPlayingIndex + 1 })}</div>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-primary/70 hover:text-primary hover:bg-primary/25 ml-0.5 h-7 w-7 shrink-0 rounded-full transition-colors"
                    onClick={stopPlayback}
                    aria-label={t('nowPlaying.stop')}
                  >
                    <Square className="h-3 w-3 fill-current" />
                  </Button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <div className="group relative">
                <Search className="text-muted-foreground group-focus-within:text-primary absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transition-colors" />
                <Input
                  className="bg-background/50 focus-visible:border-primary/50 focus-visible:ring-primary/50 h-9 w-32 rounded-full border-white/10 pl-9 shadow-inner transition-all focus-visible:ring-1 md:w-36 lg:w-48"
                  placeholder={t('searchPlaceholder')}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                />
              </div>

              <div className="bg-background/50 box-border flex h-9 shrink-0 items-center rounded-full border border-white/10 p-1 shadow-inner">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        'relative flex h-7 items-center justify-center rounded-full px-3 text-xs font-medium transition-all duration-300',
                        !isAutoPlayNext
                          ? 'bg-muted text-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                      )}
                      onClick={() => onToggleAutoPlayNext?.(false)}
                      aria-label={t('playMode.single')}
                    >
                      <div className="relative z-10 flex items-center gap-1.5">
                        <HeadphoneOff className="h-3.5 w-3.5" />
                        <span className="hidden xl:inline">{t('playMode.single')}</span>
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t('playMode.singleHelp')}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      className={cn(
                        'relative flex h-7 items-center justify-center rounded-full px-3 text-xs font-medium transition-all duration-300',
                        isAutoPlayNext
                          ? 'bg-primary/20 text-primary shadow-[0_0_10px_rgba(0,0,0,0.2)]'
                          : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
                      )}
                      onClick={() => onToggleAutoPlayNext?.(true)}
                      aria-label={t('playMode.autoNext')}
                    >
                      <div className="relative z-10 flex items-center gap-1.5">
                        <Sparkles className={cn('h-3.5 w-3.5', isAutoPlayNext && 'animate-pulse')} />
                        <span className="hidden xl:inline">{t('playMode.autoNext')}</span>
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{t('playMode.autoNextHelp')}</TooltipContent>
                </Tooltip>
              </div>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="bg-background/50 h-9 w-9 shrink-0 rounded-full border-white/10 shadow-sm transition-all hover:border-white/15 hover:bg-white/[0.06]"
                    onClick={() => void handleRefreshClick()}
                    disabled={isLoading || isRefreshing}
                  >
                    <RefreshCw className={cn('text-muted-foreground h-4 w-4', (isLoading || isRefreshing) && 'text-primary animate-spin')} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{t('tooltips.refresh')}</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Header Row — 列宽与行内网格保持一致: 20px | 1fr | 1fr | 16px，横向内边距与行卡片 px-2 对齐 */}
          <div className="border-b border-white/10 bg-white/[0.03] px-2 py-1.5">
            <div
              className="grid min-w-0 items-center gap-x-2"
              style={{ gridTemplateColumns: '20px 1fr 1fr 16px' }}
            >
              <div />
              <div className="text-muted-foreground/70 text-[11px] font-medium uppercase tracking-wide">
                {t('originalSubtitle')}
              </div>
              <div className="text-muted-foreground/70 text-right text-[11px] font-medium uppercase tracking-wide">
                {t('convertedSubtitle')}
              </div>
              <div />
            </div>
          </div>

          {/* Content */}
          <ScrollArea className="flex-1">
            <div className="space-y-1.5 p-3">
              {isLoading && (
                <div className="flex flex-col items-center justify-center gap-2 py-10 opacity-50">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <p className="text-sm">{t('loading')}</p>
                </div>
              )}

              {error && (
                <ErrorBlock message={`${t('loadError')}: ${error}`} onRetry={loadSrtFiles} retryLabel={tCommon('errorState.retry')} />
              )}

              {!isLoading &&
                filteredItems.map((item) => (
                  <SubtitleRowItem
                    key={item.id}
                    ref={(el: HTMLDivElement | null) => {
                      itemRefs.current[item.order] = el;
                    }}
                    item={item}
                    isSelected={selectedId === item.id}
                    isPlayingSource={auditionPlayingIndex === item.order && auditionActiveType === 'source' && !!isMediaPlaying}
                    isPlayingConvert={auditionPlayingIndex === item.order && auditionActiveType === 'convert' && !!isMediaPlaying}
                    isPlayingFromVideo={playingSubtitleIndex === item.order}
                    convertingType={convertingMap[item.id] || null}
                    isSaving={savingIds.has(item.id)}
                    uiVoiceState={rowVoiceStateById.get(item.id) ?? 'ready'}
                    showPreviewBlockHint={blockedPreviewHintId === item.id}
                    autoFocusConvertedEditor={focusConvertedEditorId === item.id}
                    onSelect={() => {
                      setSelectedId(item.id);
                      setFocusConvertedEditorId(null);
                      setBlockedPreviewHintId((prev) => (prev === item.id ? prev : null));
                      handleSeek(item.startTime_convert);
                    }}
                    onUpdate={(itm: SubtitleRowData) => {
                      applySubtitleItemUpdate(itm, item);
                    }}
                    onPlayPauseSource={() => togglePlayback(item.order, 'source')}
                    onPlayPauseConvert={() => togglePlayback(item.order, 'convert')}
                    onBlockedPreviewAttempt={() => setBlockedPreviewHintId(item.id)}
                    onPointerToPlaceClick={() => handleSeek(item.startTime_convert)}
                    onConvert={(itm: SubtitleRowData, type: string) => handleConvert(itm, type, itm.order)}
                    onSave={(type: string) => handleSave(item, type)}
                    onStartManualEdit={() => {
                      setSelectedId(item.id);
                      setFocusConvertedEditorId(item.id);
                      setBlockedPreviewHintId(item.id);
                      handleSeek(item.startTime_convert);
                    }}
                    onResetTiming={
                      onResetTiming
                        ? () => {
                            const startMs = srtTimeToMs(item.startTime_source);
                            const endMs = srtTimeToMs(item.endTime_source);
                            onResetTiming(item.id, resolveLinkedSourceId(item), startMs, endMs);
                          }
                        : undefined
                    }
                  />
                ))}
            </div>
          </ScrollArea>
        </div>
      );
    }
  )
);
SubtitleWorkstation.displayName = 'SubtitleWorkstation';
