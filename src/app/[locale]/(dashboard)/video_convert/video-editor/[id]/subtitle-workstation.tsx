'use client';

import React, { memo, useMemo, useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { SubtitleRowItem, SubtitleRowData } from './subtitle-row-item';
import { Button } from '@/shared/components/ui/button';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Loader2, RefreshCw, Headphones, HeadphoneOff, Search } from 'lucide-react';
import { toast } from 'sonner';
import { ConvertObj } from '@/shared/components/video-editor';
import { useAppContext } from '@/shared/contexts/app';
import { useTranslations } from 'next-intl';
import { Input } from '@/shared/components/ui/input';
import { cn } from '@/shared/lib/utils';

interface SubtitleWorkstationProps {
    onPlayingIndexChange?: (index: number) => void;
    onPendingChangesChange?: (pendingCount: number) => void;
    convertObj: ConvertObj | null;
    playingSubtitleIndex?: number;
    onSeekToSubtitle?: (time: number) => void;
    onShowTip?: () => void;
    onUpdateSubtitleAudioUrl?: (id: string, audioUrl: string) => void;
}

export const SubtitleWorkstation = memo(forwardRef<{ onVideoSaveClick: () => Promise<boolean> }, SubtitleWorkstationProps>(
    ({ onPlayingIndexChange, onPendingChangesChange, convertObj, playingSubtitleIndex = -1, onSeekToSubtitle, onShowTip, onUpdateSubtitleAudioUrl }, ref) => {
        const t = useTranslations('video_convert.videoEditor.audioList');
        const { user, fetchUserCredits } = useAppContext();

        // State
        const [subtitleItems, setSubtitleItems] = useState<SubtitleRowData[]>([]);
        const [updateItemList, setUpdateItemList] = useState<SubtitleRowData[]>([]); // Track modified items
        const [selectedId, setSelectedId] = useState<string | null>(null);
        const [playingIndex, setPlayingIndex] = useState<number>(-1);
        const [playingType, setPlayingType] = useState<'source' | 'convert' | null>(null);
        const [isLoading, setIsLoading] = useState(false);
        const [error, setError] = useState<string | null>(null);
        const [isAutoPlayNext, setIsAutoPlayNext] = useState(false);
        const [isAudioPlayEnded, setIsAudioPlayEnded] = useState(false);
        const [convertingMap, setConvertingMap] = useState<Record<string, string>>({});
        const [savingIds, setSavingIds] = useState<Set<string>>(() => new Set());
        const [searchText, setSearchText] = useState('');

        // Refs
        const audioRef = useRef<HTMLAudioElement>(null);
        const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
        const resumedJobsRef = useRef<Set<string>>(new Set());
        const ttsWarmupStartedRef = useRef(false);
        // const scrollAreaRef = useRef<HTMLDivElement>(null);

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
            const lastActiveRef = { value: Date.now() };
            const lastKeepaliveAtRef = { value: 0 };
            const minKeepaliveIntervalMs = 15 * 1000;

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
                const idleMs = Date.now() - lastActiveRef.value;
                // 超过 2 分钟不操作就不 keepalive（避免用户挂着页面吃 GPU 成本）
                if (idleMs > 2 * 60 * 1000) return;
                const now = Date.now();
                if (now - lastKeepaliveAtRef.value < minKeepaliveIntervalMs) return;
                lastKeepaliveAtRef.value = now;
                try {
                    await fetch('/api/tts/keepalive', { method: 'POST' });
                } catch {
                    // best-effort
                }
            };

            const markActive = () => {
                lastActiveRef.value = Date.now();
                // 用户从“空闲/后台”回到页面时，尽快打一发 keepalive，
                // 避免等到下一次 60s interval 才恢复 runtime，影响“准实时”体验。
                void tickKeepalive();
            };

            const events: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart', 'wheel', 'focus'];
            for (const evt of events) {
                window.addEventListener(evt, markActive, { passive: true });
            }

            const onVisibilityChange = () => {
                if (typeof document === 'undefined') return;
                if (document.visibilityState === 'visible') {
                    markActive();
                }
            };
            if (typeof document !== 'undefined') {
                document.addEventListener('visibilitychange', onVisibilityChange);
            }

            void triggerPrewarm();
            // 立刻打一发 keepalive，减少“刚进页面就点生成”时的冷启动概率
            void tickKeepalive();

            const interval = window.setInterval(() => {
                void tickKeepalive();
            }, 60 * 1000);

            return () => {
                stopped = true;
                window.clearInterval(interval);
                for (const evt of events) {
                    window.removeEventListener(evt, markActive);
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
            onPlayingIndexChange?.(playingIndex);
            if (playingIndex >= 0 && subtitleItems[playingIndex]) {
                setSelectedId(subtitleItems[playingIndex].id);
                const el = itemRefs.current[playingIndex];
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            }
        }, [playingIndex, subtitleItems]);

        useEffect(() => {
            onPendingChangesChange?.(updateItemList.length);
        }, [updateItemList.length, onPendingChangesChange]);

        // --- Audio Playback ---
        const playAudioAtIndex = (index: number, type: 'source' | 'convert') => {
            if (index < 0 || index >= subtitleItems.length || !audioRef.current || !convertObj) return;
            const item = subtitleItems[index];
            const userId = user?.id || '';
            let folderName = '';

            if (type === 'source') {
                folderName = `split_audio/audio/${item.sourceId}.wav`;
            } else {
                const base = item.audioUrl_convert_custom ? item.audioUrl_convert_custom : `adj_audio_time/${item.id}.wav`;
                folderName = item.newTime ? `${base}${base.includes('?') ? '&' : '?'}t=${item.newTime}` : base;
            }

            const audioUrl = `${convertObj.r2preUrl}/${convertObj.env}/${userId}/${convertObj.id}/${folderName}`;
            const el = audioRef.current;
            // Hard-stop any previously playing clip immediately to avoid overlap when users click quickly.
            try {
                el.pause();
            } catch {
                // ignore
            }
            try {
                if (el.readyState >= 1) el.currentTime = 0;
            } catch {
                // ignore
            }
            el.preload = 'auto';
            el.src = audioUrl;
            try {
                el.load();
            } catch {
                // ignore
            }
            el.play().catch((err) => {
                // AbortError is expected when the user pauses/changes clips quickly.
                if (err && typeof err === 'object' && (err as any).name === 'AbortError') return;
                console.error('Audio play failed:', err);
                setIsAudioPlayEnded(true);
                toast.error(t('toast.playFailed'));
            });

            setPlayingIndex(index);
            setPlayingType(type);
        };

        const handleAudioEnded = () => {
            setIsAudioPlayEnded(true);
            if (isAutoPlayNext) {
                const nextIndex = playingIndex + 1;
                if (nextIndex < subtitleItems.length) {
                    playAudioAtIndex(nextIndex, playingType!);
                } else {
                    setPlayingIndex(-1);
                    setPlayingType(null);
                }
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
            try {
                const resp = await fetch('/api/video-task/generate-video', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ taskId: convertObj.id }),
                });
                const { code, message, data } = await resp.json();
                if (code === 0) {
                    toast.success(t('toast.videoSaveSuccess'));
                    setUpdateItemList([]);

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
            <div className="flex flex-col h-full bg-background/40 backdrop-blur-sm">
                <audio ref={audioRef} onEnded={handleAudioEnded} className="hidden" />

                {/* Toolbar */}
                <div className="flex items-center justify-between px-4 py-3 border-b bg-card/60 backdrop-blur-md">
                    <div className="flex items-center gap-2">
                        {updateItemList.length > 0 && (
                            <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-muted-foreground">
                                {t('pendingChanges', { count: updateItemList.length })}
                            </span>
                        )}
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                className="h-8 w-48 pl-8 bg-muted/50 border-none"
                                placeholder="Search..."
                                value={searchText}
                                onChange={e => setSearchText(e.target.value)}
                            />
                        </div>

                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsAutoPlayNext(!isAutoPlayNext)}>
                            {isAutoPlayNext ? <Headphones className="w-4 h-4 text-primary" /> : <HeadphoneOff className="w-4 h-4" />}
                        </Button>

                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={loadSrtFiles} disabled={isLoading}>
                            <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
                        </Button>
                    </div>
                </div>

                {/* Header Row */}
                <div className="flex px-4 py-2 border-b bg-muted/10 text-xs font-semibold text-muted-foreground uppercase opacity-70">
                    <div className="flex-1">{t('originalSubtitle')}</div>
                    <div className="w-8"></div>
                    <div className="flex-1">{t('convertedSubtitle')}</div>
                </div>

                {/* Content */}
                <ScrollArea className="flex-1">
                    <div className="p-4 space-y-2">
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
                                isPlayingSource={playingIndex === item.order && playingType === 'source' && !isAudioPlayEnded}
                                isPlayingConvert={playingIndex === item.order && playingType === 'convert' && !isAudioPlayEnded}
                                isPlayingFromVideo={playingSubtitleIndex === item.order}
                                convertingType={convertingMap[item.id] || null}
                                isSaving={savingIds.has(item.id)}
                                onSelect={() => setSelectedId(item.id)}
                                onUpdate={(itm: SubtitleRowData) => setSubtitleItems((prev) => prev.map((current) => current.order === itm.order ? itm : current))}
                                onPlayPauseSource={() => playingIndex === item.order && playingType === 'source' && !isAudioPlayEnded ? (audioRef.current?.pause(), setPlayingIndex(-1)) : (setIsAudioPlayEnded(false), playAudioAtIndex(item.order, 'source'))}
                                onPlayPauseConvert={() => playingIndex === item.order && playingType === 'convert' && !isAudioPlayEnded ? (audioRef.current?.pause(), setPlayingIndex(-1)) : (setIsAudioPlayEnded(false), playAudioAtIndex(item.order, 'convert'))}
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
