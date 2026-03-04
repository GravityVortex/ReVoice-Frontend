'use client';

import React, { memo, useMemo, useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { SubtitleRowItem, SubtitleRowData } from './subtitle-row-item';
import { Button } from '@/shared/components/ui/button';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Loader2, RefreshCw, Headphones, HeadphoneOff, Search, Square, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { ConvertObj } from '@/shared/components/video-editor';
import { useAppContext } from '@/shared/contexts/app';
import { useTranslations } from 'next-intl';
import { Input } from '@/shared/components/ui/input';
import { cn } from '@/shared/lib/utils';

interface SubtitleWorkstationProps {
    onPlayingIndexChange?: (index: number) => void;
    onPendingChangesChange?: (pendingCount: number) => void;
    // 提供给父组件：本地“已应用但未重新合成”的字幕段 id 列表（用于合并服务端 pending 计算）
    onPendingVoiceIdsChange?: (ids: string[]) => void;
    // 重新合成完成（成功）回调：用于父组件更新 lastMergedAtMs，让右上角按钮自动变灰
    onVideoMergeCompleted?: (args: { mergedAtMs: number }) => void;

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
}

export const SubtitleWorkstation = memo(forwardRef<{ onVideoSaveClick: () => Promise<boolean> }, SubtitleWorkstationProps>(
    ({ onPlayingIndexChange, onPendingChangesChange, onPendingVoiceIdsChange, onVideoMergeCompleted, onRequestAuditionPlay, onRequestAuditionToggle, onRequestAuditionStop, auditionPlayingIndex, auditionActiveType, isMediaPlaying, isAutoPlayNext = false, onToggleAutoPlayNext, convertObj, playingSubtitleIndex = -1, onSeekToSubtitle, onShowTip, onUpdateSubtitleAudioUrl }, ref) => {
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
        const [searchText, setSearchText] = useState('');

        // Refs
        const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
        const resumedJobsRef = useRef<Set<string>>(new Set());
        const ttsWarmupStartedRef = useRef(false);
        const rootRef = useRef<HTMLDivElement>(null);

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
                [job.subtitleId]: job.type
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
                setSubtitleItems((prev) =>
                    prev.map((itm) =>
                        itm.id === job.subtitleId
                            ? {
                                ...itm,
                                ...(job.type === 'gen_srt'
                                    ? { text_convert: resolvedData.text_translated }
                                    : { audioUrl_convert_custom: resolvedData.path_name + '?t=' + newTime }),
                            }
                            : itm
                    )
                );
                if (job.type === 'translate_srt' && onUpdateSubtitleAudioUrl) {
                    const userId = user?.id || '';
                    const audioUrl = `${convertObj.r2preUrl}/${convertObj.env}/${userId}/${convertObj.id}/${resolvedData.path_name}?t=${newTime}`;
                    onUpdateSubtitleAudioUrl(job.subtitleId, audioUrl);
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

                    const ttsUpdatedAtMsRaw = (convertItem as any)?.vap_tts_updated_at_ms;
                    const ttsUpdatedAtMs =
                        typeof ttsUpdatedAtMsRaw === 'number'
                            ? ttsUpdatedAtMsRaw
                            : Number.parseInt(String(ttsUpdatedAtMsRaw || ''), 10);
                    const audioCacheBuster =
                        Number.isFinite(ttsUpdatedAtMs) && ttsUpdatedAtMs > 0 ? String(ttsUpdatedAtMs) : '';

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
                        audioUrl_convert: convertItem?.audio_url || '',
                        // Stable cache-buster: only changes when voice regeneration succeeds.
                        // This keeps playback snappy by allowing browser caching across refreshes.
                        newTime: audioCacheBuster,
                    };

                    // Restore draft outputs from vt_task_subtitle.subtitle_data (no vt_task_main.metadata).
                    const draftAudioPath = convertItem?.vap_draft_audio_path as string | undefined;
                    if (draftAudioPath && typeof draftAudioPath === 'string' && draftAudioPath.length > 0) {
                        const base = draftAudioPath.split('?')[0];
                        nextItem.audioUrl_convert_custom = `${base}?t=${audioCacheBuster || now}`;
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
            onPendingVoiceIdsChange?.(
                updateItemList
                    .map((it) => it?.id)
                    .filter((id): id is string => typeof id === 'string' && id.length > 0)
            );
        }, [updateItemList, onPendingChangesChange, onPendingVoiceIdsChange]);

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
                [item.id]: type
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

                const resp = await fetch(url, { method: "POST", body: JSON.stringify(params) });
                const { code, message, data } = await resp.json();

                if (code === 0) {
                    let resolvedData = data;

                    // Async job: poll until we get the same payload as the legacy sync API.
                    if (data?.status === 'pending' && data?.jobId) {
                        const jobId =
                            typeof data?.jobId === 'string' && data.jobId.length > 0 ? (data.jobId as string) : '';
                        const requestKey =
                            typeof data?.requestKey === 'string' && data.requestKey.length > 0 ? (data.requestKey as string) : '';
                        resolvedData = await pollSubtitleJob({
                            taskId: convertObj.id,
                            subtitleName: item.id,
                            type: type as PendingJob['type'],
                            jobId,
                            requestKey,
                        });
                    }

                    toast.success(t('toast.generateSuccess'));
                    void fetchUserCredits();
                    const newTime = new Date().getTime();
                    setSubtitleItems((prev) =>
                        prev.map((itm) =>
                            itm.order === item.order
                                ? {
                                    ...itm,
                                    ...(type === 'gen_srt'
                                        ? { text_convert: resolvedData.text_translated }
                                        : { audioUrl_convert_custom: resolvedData.path_name + '?t=' + newTime }),
                                }
                                : itm
                        )
                    );

                    if (type === 'translate_srt' && onUpdateSubtitleAudioUrl) {
                        const userId = user?.id || '';
                        const audioUrl = `${convertObj.r2preUrl}/${convertObj.env}/${userId}/${convertObj.id}/${resolvedData.path_name}?t=${newTime}`;
                        onUpdateSubtitleAudioUrl(item.id, audioUrl);
                    }
                } else {
                    toast.error(message || t('toast.generateFailed'));
                }
            } catch {
                toast.error(t('toast.generateFailed'));
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
                        seq: nextItem.seq,
                        pathName,
                        item: nextItem
                    }),
                });
                const { code } = await resp.json();
                if (code === 0) {
                    toast.success(t('toast.saveSuccess'));
                    setSubtitleItems((prev) =>
                        prev.map((itm) =>
                            itm.order === item.order
                                ? { ...itm, newTime: '' + Date.now(), audioUrl_convert_custom: '' }
                                : itm
                        )
                    );
                    if (onUpdateSubtitleAudioUrl) {
                        const newTime = Date.now();
                        const userId = user?.id || '';
                        const audioUrl = `${convertObj.r2preUrl}/${convertObj.env}/${userId}/${convertObj.id}/adj_audio_time/${item.id}.wav?t=${newTime}`;
                        onUpdateSubtitleAudioUrl(item.id, audioUrl);
                    }
                    setUpdateItemList(prev => {
                        const copy = [...prev];
                        const existing = copy.findIndex(i => i.order === item.order);
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
                        const jobId =
                            typeof data?.jobId === 'string' && data.jobId.length > 0 ? (data.jobId as string) : '';
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
                                    // ✅ 仅在“合成成功”后清空本地 pending 列表
                                    setUpdateItemList([]);
                                    onVideoMergeCompleted?.({ mergedAtMs: mergeTriggeredAtMs });
                                    return;
                                }
                                if (pollBack?.code !== 0) {
                                    toast.error(pollBack?.message || t('toast.videoSaveFailed'));
                                    return;
                                }
                            }
                            toast.error(t('toast.videoSaveFailed'));
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

        useImperativeHandle(ref, () => ({ onVideoSaveClick }));

        // Time Seconds Helper
        const parseTimeToSeconds = (timeStr: string): number => {
            const parts = timeStr.split(':');
            if (parts.length !== 3) return 0;
            const hours = parseInt(parts[0], 10);
            const minutes = parseInt(parts[1], 10);
            let seconds = 0, ms = 0;
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

        const filteredItems = useMemo(() => {
            const q = searchText.trim().toLowerCase();
            if (!q) return subtitleItems;
            return subtitleItems.filter((item) =>
                item.text_source.toLowerCase().includes(q) ||
                item.text_convert.toLowerCase().includes(q)
            );
        }, [searchText, subtitleItems]);

        return (
            <div ref={rootRef} className="flex flex-col h-full bg-background/40 backdrop-blur-sm">
                {/* Toolbar */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-white/[0.04] bg-card/40 backdrop-blur-xl">
                    <div className="flex items-center gap-3">
                        {updateItemList.length > 0 && (
                            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-muted-foreground font-medium shadow-sm">
                                {t('pendingChanges', { count: updateItemList.length })}
                            </span>
                        )}
                        {isMediaPlaying && auditionPlayingIndex !== undefined && auditionActiveType !== undefined && (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 animate-in fade-in slide-in-from-top-2 duration-300">
                                <div className="flex items-center gap-1">
                                    <div className="w-1 h-3 bg-primary/80 rounded-full animate-[bounce_1s_infinite] [animation-delay:-0.3s]"></div>
                                    <div className="w-1 h-4 bg-primary rounded-full animate-[bounce_1s_infinite] [animation-delay:-0.15s]"></div>
                                    <div className="w-1 h-2 bg-primary/60 rounded-full animate-[bounce_1s_infinite]"></div>
                                </div>

                                {auditionPlayingIndex >= 0 && (
                                    <div className="text-xs font-medium text-primary">
                                        {t('nowPlaying.row', { num: auditionPlayingIndex + 1 })}
                                    </div>
                                )}

                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-full text-primary/70 hover:text-primary hover:bg-primary/25 transition-colors ml-0.5 shrink-0"
                                    onClick={stopPlayback}
                                    aria-label={t('nowPlaying.stop')}
                                    title={t('nowPlaying.stop')}
                                >
                                    <Square className="w-3 h-3 fill-current" />
                                </Button>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative group">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                            <Input
                                className="h-9 w-32 md:w-36 lg:w-48 pl-9 bg-background/50 border-white/5 focus-visible:border-primary/50 focus-visible:ring-1 focus-visible:ring-primary/50 transition-all rounded-full shadow-inner"
                                placeholder={t('searchPlaceholder')}
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                            />
                        </div>

                        <div
                            className="flex items-center rounded-full border border-white/5 bg-background/50 p-1 h-9 shadow-inner shrink-0 box-border"
                            title={t('playMode.help')}
                        >
                            <button
                                className={cn(
                                    "relative flex items-center justify-center h-7 px-3 text-xs font-medium rounded-full transition-all duration-300",
                                    !isAutoPlayNext ? "bg-muted text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                                )}
                                onClick={() => onToggleAutoPlayNext?.(false)}
                                aria-label={t('playMode.single')}
                                title={t('playMode.single')}
                            >
                                <div className="flex items-center gap-1.5 relative z-10">
                                    <HeadphoneOff className="w-3.5 h-3.5" />
                                    <span className="hidden xl:inline">{t('playMode.single')}</span>
                                </div>
                            </button>
                            <button
                                className={cn(
                                    "relative flex items-center justify-center h-7 px-3 text-xs font-medium rounded-full transition-all duration-300",
                                    isAutoPlayNext ? "bg-primary/20 text-primary shadow-[0_0_10px_rgba(var(--primary),0.2)]" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                                )}
                                onClick={() => onToggleAutoPlayNext?.(true)}
                                aria-label={t('playMode.autoNext')}
                                title={t('playMode.autoNext')}
                            >
                                <div className="flex items-center gap-1.5 relative z-10">
                                    <Sparkles className={cn("w-3.5 h-3.5", isAutoPlayNext && "animate-pulse")} />
                                    <span className="hidden xl:inline">{t('playMode.autoNext')}</span>
                                </div>
                            </button>
                        </div>

                        <Button variant="outline" size="icon" className="h-9 w-9 rounded-full border-white/5 bg-background/50 hover:bg-white/10 hover:border-white/10 transition-all shadow-sm shrink-0" onClick={loadSrtFiles} disabled={isLoading}>
                            <RefreshCw className={cn("w-4 h-4 text-muted-foreground", isLoading && "animate-spin text-primary")} />
                        </Button>
                    </div>
                </div>

                {/* Header Row */}
                <div className="flex px-3 py-1.5 border-b bg-muted/10 text-[11px] font-semibold text-muted-foreground uppercase opacity-70">
                    <div className="flex-1">{t('originalSubtitle')}</div>
                    <div className="w-8"></div>
                    <div className="flex-1">{t('convertedSubtitle')}</div>
                </div>

                {/* Content */}
                <ScrollArea className="flex-1">
                    <div className="p-3 space-y-1.5">
                        {isLoading && (
                            <div className="flex flex-col items-center justify-center py-10 gap-2 opacity-50">
                                <Loader2 className="w-8 h-8 animate-spin" />
                                <p className="text-sm">{t('loading')}</p>
                            </div>
                        )}

                        {error && (
                            <div className="p-4 rounded bg-destructive/10 text-destructive text-sm">
                                <b>{t('loadError')}:</b> {error}
                            </div>
                        )}

                        {!isLoading && filteredItems.map((item) => (
                            <SubtitleRowItem
                                key={item.id}
                                ref={(el: HTMLDivElement | null) => { itemRefs.current[item.order] = el; }}
                                item={item}
                                isSelected={selectedId === item.id}
                                isPlayingSource={auditionPlayingIndex === item.order && auditionActiveType === 'source' && !!isMediaPlaying}
                                isPlayingConvert={auditionPlayingIndex === item.order && auditionActiveType === 'convert' && !!isMediaPlaying}
                                isPlayingFromVideo={playingSubtitleIndex === item.order}
                                convertingType={convertingMap[item.id] || null}
                                isSaving={savingIds.has(item.id)}
                                onSelect={() => setSelectedId(item.id)}
                                onUpdate={(itm: SubtitleRowData) => setSubtitleItems((prev) => prev.map((current) => current.order === itm.order ? itm : current))}
                                onPlayPauseSource={() => togglePlayback(item.order, 'source')}
                                onPlayPauseConvert={() => togglePlayback(item.order, 'convert')}
                                onPointerToPlaceClick={() => handleSeek(item.startTime_convert)}
                                onConvert={(itm: SubtitleRowData, type: string) => handleConvert(itm, type, itm.order)}
                                onSave={(type: string) => handleSave(item, type)}
                            />
                        ))}
                    </div>
                </ScrollArea>
            </div>
        );
    }
));
SubtitleWorkstation.displayName = 'SubtitleWorkstation';
