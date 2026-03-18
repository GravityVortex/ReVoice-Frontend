'use client';

import React, { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { HeadphoneOff, Loader2, RefreshCw, Scissors, Search, Sparkles, Square } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { ErrorBlock } from '@/shared/blocks/common/error-state';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { ConvertObj } from '@/shared/components/video-editor/types';
import { useAppContext } from '@/shared/contexts/app';
import { deriveSubtitleVoiceUiState, type SubtitleVoiceUiState } from '@/shared/lib/subtitle-voice-state';
import { cn } from '@/shared/lib/utils';

import { SubtitleRowData, SubtitleRowItem } from './subtitle-row-item';

interface SubtitleWorkstationProps {
  onPlayingIndexChange?: (index: number) => void;
  onPendingChangesChange?: (pendingCount: number) => void;
  // 提供给父组件：本地“已应用但未重新合成”的字幕段 id 列表（用于合并服务端 pending 计算）
  onPendingVoiceIdsChange?: (ids: string[]) => void;
  // 重新合成完成（成功）回调：用于父组件更新 lastMergedAtMs，让右上角按钮自动变灰
  onVideoMergeCompleted?: (args: { mergedAtMs: number }) => void;
  // 合成任务启动回调：父组件用 jobId 追踪合成进度，刷新后也能恢复
  onVideoMergeStarted?: (args: { jobId: string; createdAtMs: number }) => void;
  // 合成任务失败/超时回调：父组件清除合成进行中状态
  onVideoMergeFailed?: () => void;

  // Audition Playback API
  onRequestAuditionPlay?: (index: number, mode: 'source' | 'convert') => void;
  onRequestAuditionToggle?: () => void;
  onRequestAuditionStop?: () => void;
  auditionPlayingIndex?: number;
  auditionActiveType?: 'source' | 'convert' | null;
  isMediaPlaying?: boolean;
  isAutoPlayNext?: boolean;
  onToggleAutoPlayNext?: (val: boolean) => void;

  convertObj: ConvertObj | null;
  playingSubtitleIndex?: number;
  onSeekToSubtitle?: (time: number) => void;
  onShowTip?: () => void;
  onUpdateSubtitleAudioUrl?: (id: string, audioUrl: string) => void;
  onSubtitleTextChange?: (id: string, text: string) => void;
  onDirtyStateChange?: (isDirty: boolean) => void;
}

export interface SubtitleWorkstationHandle {
  onVideoSaveClick: () => Promise<boolean>;
  scrollToItem: (id: string) => void;
}

export const SubtitleWorkstation = memo(
  forwardRef<SubtitleWorkstationHandle, SubtitleWorkstationProps>(
    (
      {
        onPlayingIndexChange,
        onPendingChangesChange,
        onPendingVoiceIdsChange,
        onVideoMergeCompleted,
        onVideoMergeStarted,
        onVideoMergeFailed,
        onRequestAuditionPlay,
        onRequestAuditionToggle,
        onRequestAuditionStop,
        auditionPlayingIndex,
        auditionActiveType,
        isMediaPlaying,
        isAutoPlayNext = false,
        onToggleAutoPlayNext,
        convertObj,
        playingSubtitleIndex = -1,
        onSeekToSubtitle,
        onShowTip,
        onUpdateSubtitleAudioUrl,
        onSubtitleTextChange,
        onDirtyStateChange,
      },
      ref
    ) => {
      const t = useTranslations('video_convert.videoEditor.audioList');
      const { user, fetchUserCredits } = useAppContext();

      // State
      const [subtitleItems, setSubtitleItems] = useState<SubtitleRowData[]>([]);
      const [updateItemList, setUpdateItemList] = useState<SubtitleRowData[]>([]); // Track modified items
      const [selectedId, setSelectedId] = useState<string | null>(null);
      const [isLoading, setIsLoading] = useState(false);
      const [error, setError] = useState<string | null>(null);
      const [convertingMap, setConvertingMap] = useState<Record<string, string>>({});
      const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
      const [invalidatedDraftAudioIds, setInvalidatedDraftAudioIds] = useState<Set<string>>(() => new Set());
      const [textPreparedForVoiceIds, setTextPreparedForVoiceIds] = useState<Set<string>>(() => new Set());
      const [blockedPreviewHintId, setBlockedPreviewHintId] = useState<string | null>(null);
      const [focusConvertedEditorId, setFocusConvertedEditorId] = useState<string | null>(null);
      const [searchText, setSearchText] = useState('');
      const [showOnlySplitPending, setShowOnlySplitPending] = useState(false);

      // Refs
      const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
      const resumedJobsRef = useRef<Set<string>>(new Set());
      const ttsWarmupStartedRef = useRef(false);
      const rootRef = useRef<HTMLDivElement>(null);
      const textChangeTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
      const autoSaveTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

      const debouncedTextChange = useCallback(
        (id: string, text: string) => {
          if (!onSubtitleTextChange) return;
          clearTimeout(textChangeTimersRef.current[id]);
          textChangeTimersRef.current[id] = setTimeout(() => {
            onSubtitleTextChange(id, text);
            delete textChangeTimersRef.current[id];
          }, 350);
        },
        [onSubtitleTextChange]
      );

      const debouncedAutoSaveText = useCallback(
        (subtitleId: string, text: string) => {
          if (!convertObj) return;
          clearTimeout(autoSaveTimersRef.current[subtitleId]);
          autoSaveTimersRef.current[subtitleId] = setTimeout(() => {
            delete autoSaveTimersRef.current[subtitleId];
            fetch('/api/video-task/auto-save-draft', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ taskId: convertObj.id, subtitleId, draftTxt: text }),
            }).catch(() => {
              /* best-effort */
            });
          }, 1500);
        },
        [convertObj]
      );

      useEffect(() => {
        const timers = textChangeTimersRef.current;
        const saveTimers = autoSaveTimersRef.current;
        return () => {
          Object.values(timers).forEach(clearTimeout);
          Object.values(saveTimers).forEach(clearTimeout);
        };
      }, []);

      const buildDraftPreviewUrl = useCallback((pathName: string, cacheBust: string | number) => {
        const base = pathName.split('?')[0];
        return `${base}?t=${cacheBust}`;
      }, []);

      const buildPublicAudioUrl = useCallback(
        (pathName: string, cacheBust: string | number) => {
          if (!convertObj) return buildDraftPreviewUrl(pathName, cacheBust);
          const userId = user?.id || convertObj.userId || '';
          if (!convertObj.r2preUrl || !convertObj.env || !userId) {
            return buildDraftPreviewUrl(pathName, cacheBust);
          }
          const base = pathName.split('?')[0];
          return `${convertObj.r2preUrl}/${convertObj.env}/${userId}/${convertObj.id}/${base}?t=${cacheBust}`;
        },
        [buildDraftPreviewUrl, convertObj, user?.id]
      );

      const deriveRowVoiceUiState = useCallback(
        (item: SubtitleRowData): SubtitleVoiceUiState => {
          return deriveSubtitleVoiceUiState({
            persistedText: item.persistedText_convert ?? '',
            effectiveText: item.text_convert ?? '',
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
      };

      async function pollSubtitleJob(args: {
        taskId: string;
        subtitleName: string;
        type: PendingJob['type'];
        jobId: string;
        requestKey?: string;
        timeoutMs?: number;
      }) {
        const { taskId, subtitleName, type, jobId, requestKey, timeoutMs = 30 * 60 * 1000 } = args;
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
          await new Promise((r) => setTimeout(r, 2000));
          const pollResp = await fetch(
            `/api/video-task/generate-subtitle-voice?taskId=${encodeURIComponent(taskId)}&subtitleName=${encodeURIComponent(subtitleName)}&type=${encodeURIComponent(type)}&jobId=${encodeURIComponent(jobId)}${requestKey ? `&requestKey=${encodeURIComponent(requestKey)}` : ''}`
          );
          const pollBack = await pollResp.json().catch(() => null);
          if (pollBack?.code === 0) {
            const d = pollBack?.data;
            if (type === 'translate_srt' && d?.path_name) return d;
            if (type === 'gen_srt' && d?.text_translated) return d;
          } else if (pollBack?.code != null) {
            throw new Error(pollBack?.message || t('toast.generateFailed'));
          }
        }
        throw new Error(t('toast.generateFailed'));
      }

      async function resumePendingJob(job: PendingJob) {
        if (!convertObj) return;
        const resumeKey = `${job.type}:${job.jobId}`;
        if (resumedJobsRef.current.has(resumeKey)) return;
        resumedJobsRef.current.add(resumeKey);

        setConvertingMap((prev) => ({
          ...prev,
          [job.subtitleId]: job.type,
        }));

        try {
          const resolvedData = await pollSubtitleJob({
            taskId: convertObj.id,
            subtitleName: job.subtitleId,
            type: job.type,
            jobId: job.jobId,
            requestKey: job.requestKey,
          });
          const newTime = Date.now();
          if (job.type === 'gen_srt') {
            setSubtitleItems((prev) =>
              prev.map((itm) =>
                itm.id === job.subtitleId
                  ? {
                      ...itm,
                      text_convert: resolvedData.text_translated,
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
          }

          if (job.type === 'translate_srt') {
            setSubtitleItems((prev) =>
              prev.map((itm) =>
                itm.id === job.subtitleId
                  ? {
                      ...itm,
                      draftAudioPath: resolvedData.path_name,
                      audioUrl_convert_custom: buildDraftPreviewUrl(resolvedData.path_name, newTime),
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
          }

          if (job.type === 'translate_srt' && onUpdateSubtitleAudioUrl) {
            onUpdateSubtitleAudioUrl(job.subtitleId, buildPublicAudioUrl(resolvedData.path_name, newTime));
          }
        } catch (e) {
          // Silent resume failure: the user will see "generate failed" only if they actively retry.
          console.warn('[subtitle-workstation] resume job failed:', e);
        } finally {
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
              });
            }
            const ttsJobId = convertItem?.vap_tts_job_id as string | undefined;
            if (ttsJobId && typeof ttsJobId === 'string' && ttsJobId.length > 0) {
              pendingJobs.push({
                subtitleId: convertId,
                type: 'translate_srt',
                jobId: ttsJobId,
                requestKey: convertItem?.vap_tts_request_key as string | undefined,
              });
            }

            items.push(nextItem);
          }

          setSubtitleItems(items);
          const validIds = new Set(items.map((item) => item.id));
          setInvalidatedDraftAudioIds((prev) => {
            const next = new Set<string>();
            prev.forEach((id) => {
              if (validIds.has(id)) next.add(id);
            });
            return next;
          });
          setTextPreparedForVoiceIds((prev) => {
            const next = new Set<string>();
            prev.forEach((id) => {
              if (validIds.has(id)) next.add(id);
            });
            return next;
          });
          setSelectedId((prev) => (prev && validIds.has(prev) ? prev : null));
          setBlockedPreviewHintId((prev) => (prev && validIds.has(prev) ? prev : null));
          setFocusConvertedEditorId((prev) => (prev && validIds.has(prev) ? prev : null));
          // Fire-and-forget resume so the UI keeps moving after refresh.
          for (const job of pendingJobs) {
            void resumePendingJob(job);
          }
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : t('loadError');
          setError(errorMessage);
          console.error('Failed to load SRT files:', err);
        } finally {
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
        if (ttsWarmupStartedRef.current) return;
        ttsWarmupStartedRef.current = true;

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
        if (playingSubtitleIndex == null || playingSubtitleIndex < 0) return;
        const el = itemRefs.current[playingSubtitleIndex];
        if (!el) return;
        requestAnimationFrame(() => {
          el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        });
      }, [playingSubtitleIndex]);

      useEffect(() => {
        onPlayingIndexChange?.(playingSubtitleIndex);
        if (playingSubtitleIndex >= 0 && subtitleItems[playingSubtitleIndex]) {
          const el = itemRefs.current[playingSubtitleIndex];
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        }
      }, [playingSubtitleIndex, subtitleItems]);

      useEffect(() => {
        onPendingChangesChange?.(updateItemList.length);
        onPendingVoiceIdsChange?.(updateItemList.map((it) => it?.id).filter((id): id is string => typeof id === 'string' && id.length > 0));
      }, [updateItemList, onPendingChangesChange, onPendingVoiceIdsChange]);

      useEffect(() => {
        if (!onDirtyStateChange) return;
        const hasPendingVoiceWork = subtitleItems.some((item) => {
          const state = deriveRowVoiceUiState(item);
          return state === 'audio_ready' || state === 'text_ready';
        });
        onDirtyStateChange(hasPendingVoiceWork || updateItemList.length > 0);
      }, [deriveRowVoiceUiState, onDirtyStateChange, subtitleItems, updateItemList]);

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
                taskId: convertObj.id,
                subtitleName: item.id,
                type: type as PendingJob['type'],
                jobId,
                requestKey,
              });
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
            }

            if (type === 'translate_srt' && onUpdateSubtitleAudioUrl) {
              onUpdateSubtitleAudioUrl(item.id, buildPublicAudioUrl(resolvedData.path_name, newTime));
            }
          } else {
            toast.error(message || t('toast.generateFailed'));
          }
        } catch (e) {
          const isTimeout = e instanceof DOMException && e.name === 'TimeoutError';
          toast.error(isTimeout ? t('toast.generateTimeout') : t('toast.generateFailed'));
        } finally {
          setConvertingMap((prev) => {
            const next = { ...prev };
            delete next[item.id];
            return next;
          });
        }
      };

      const handleSave = async (item: SubtitleRowData, type: string) => {
        if (!convertObj) return;
        if (type !== 'translate_srt') return;

        const convertArr = (convertObj.srt_convert_arr || []) as any[];
        const targetItem = convertArr.find((itm: any) => itm?.id === item.id);
        if (!targetItem) {
          toast.error(t('toast.itemNotFound'));
          return;
        }

        const nextItem = { ...targetItem, txt: item.text_convert };
        const tempArr = item.audioUrl_convert_custom?.split('?') || [];
        const pathName = tempArr.length > 0 ? tempArr[0] : item.audioUrl_convert_custom;
        if (!pathName) {
          toast.error(t('toast.saveFailed'));
          return;
        }

        setSavingIds((prev) => {
          const next = new Set(prev);
          next.add(item.id);
          return next;
        });

        try {
          const resp = await fetch('/api/video-task/update-subtitle-item', {
            method: 'POST',
            body: JSON.stringify({
              userId: convertObj.userId,
              taskId: convertObj.id,
              type,
              id: nextItem.id,
              pathName,
              item: nextItem,
            }),
          });
          const { code } = await resp.json();
          if (code === 0) {
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
            setUpdateItemList((prev) => {
              const copy = [...prev];
              const existing = copy.findIndex((i) => i.order === item.order);
              if (existing > -1) copy[existing] = item;
              else copy.push(item);
              return copy;
            });
            onShowTip?.();
          } else {
            toast.error(t('toast.saveFailed'));
          }
        } catch {
          toast.error(t('toast.saveFailed'));
        } finally {
          setSavingIds((prev) => {
            const next = new Set(prev);
            next.delete(item.id);
            return next;
          });
        }
      };

      const onVideoSaveClick = async () => {
        if (!convertObj) return false;
        // 用“触发合成的时间”作为 lastMergedAtMs 的保守值：
        // - 合成完成后更新为该时间，可确保“合成过程中新增的修改”不会被误判为已合成。
        const mergeTriggeredAtMs = Date.now();
        try {
          const resp = await fetch('/api/video-task/generate-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId: convertObj.id }),
          });
          const { code, message, data } = await resp.json();
          if (code === 0) {
            toast.success(t('toast.videoSaveSuccess'));

            // Async job: poll completion in background so the user doesn't need to guess.
            if (data?.status === 'pending') {
              const startedAt = Date.now();
              const timeoutMs = 60 * 60 * 1000;
              const jobTaskId = convertObj.id;
              const jobId = typeof data?.jobId === 'string' && data.jobId.length > 0 ? (data.jobId as string) : '';
              onVideoMergeStarted?.({ jobId, createdAtMs: mergeTriggeredAtMs });
              (async () => {
                while (Date.now() - startedAt < timeoutMs) {
                  await new Promise((r) => setTimeout(r, 4000));
                  const pollResp = await fetch(
                    jobId
                      ? `/api/video-task/generate-video?taskId=${encodeURIComponent(jobTaskId)}&jobId=${encodeURIComponent(jobId)}`
                      : `/api/video-task/generate-video?taskId=${encodeURIComponent(jobTaskId)}`
                  );
                  const pollBack = await pollResp.json().catch(() => null);
                  if (pollBack?.code === 0 && pollBack?.data?.video_new_preview) {
                    toast.success(t('toast.videoSaveCompleted'));
                    setUpdateItemList([]);
                    onVideoMergeCompleted?.({ mergedAtMs: mergeTriggeredAtMs });
                    return;
                  }
                  if (pollBack?.code !== 0) {
                    toast.error(pollBack?.message || t('toast.videoSaveFailed'));
                    onVideoMergeFailed?.();
                    return;
                  }
                }
                toast.error(t('toast.videoSaveFailed'));
                onVideoMergeFailed?.();
              })();
            }
            return true;
          } else {
            toast.error(message || t('toast.videoSaveFailed'));
            return false;
          }
        } catch {
          toast.error(t('toast.videoSaveFailed'));
          return false;
        }
      };

      const scrollToItem = useCallback((id: string) => {
        setSelectedId(id);
        // 等 convertObj 更新后 subtitleItems 重载，再用 ref 滚动
        setTimeout(() => {
          setSubtitleItems((items) => {
            const idx = items.findIndex((itm) => itm.id === id);
            if (idx >= 0) {
              itemRefs.current[items[idx].order]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
            return items;
          });
        }, 200);
      }, []);

      useImperativeHandle(ref, () => ({ onVideoSaveClick, scrollToItem }));

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
          if (!Boolean(item.splitParentId || item.splitOperationId)) return false;
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
              {updateItemList.length > 0 && (
                <span className="text-muted-foreground rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs font-medium shadow-sm">
                  {t('pendingChanges', { count: updateItemList.length })}
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
                    onClick={loadSrtFiles}
                    disabled={isLoading}
                  >
                    <RefreshCw className={cn('text-muted-foreground h-4 w-4', isLoading && 'text-primary animate-spin')} />
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
                <ErrorBlock message={`${t('loadError')}: ${error}`} onRetry={loadSrtFiles} />
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
                      const textActuallyChanged = itm.text_convert !== item.text_convert;
                      const hasExistingDraftAudio = Boolean(item.draftAudioPath || item.audioUrl_convert_custom);

                      setSubtitleItems((prev) => prev.map((current) => (current.id === itm.id ? { ...current, ...itm } : current)));

                      if (textActuallyChanged && hasExistingDraftAudio) {
                        setInvalidatedDraftAudioIds((prev) => {
                          const next = new Set(prev);
                          next.add(itm.id);
                          return next;
                        });
                      }

                      debouncedTextChange(itm.id, itm.text_convert);
                      debouncedAutoSaveText(itm.id, itm.text_convert);
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
