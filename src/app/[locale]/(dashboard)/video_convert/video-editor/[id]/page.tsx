"use client";

import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, CheckCircle2, Info, Loader2, Sparkles, XCircle } from 'lucide-react';

import { useRouter } from '@/core/i18n/navigation';
import { useUnsavedChangesGuard } from '@/shared/hooks/use-unsaved-changes-guard';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/shared/components/ui/dialog';
import { ConvertObj, TrackItem, SubtitleTrackItem } from '@/shared/components/video-editor/types';
import { cn, getLanguageConvertStr } from '@/shared/lib/utils';
import { estimateTaskPercent } from '@/shared/lib/task-progress';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { ErrorState, ErrorBlock } from '@/shared/blocks/common/error-state';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/shared/components/ui/tooltip';
import { useAppContext } from '@/shared/contexts/app';
import { RetroGrid } from '@/shared/components/magicui/retro-grid';
import { toast } from 'sonner';
import { ResizableSplitPanel } from '@/shared/components/resizable-split-panel';
import { createLimitedTaskQueue } from '@/shared/lib/waveform/loader';
import { getBufferedAheadSeconds } from '@/shared/lib/media-buffer';
import { collectMissingVoiceIds, resolveSourcePlaybackMode, resolveSplitTranslatedAudioPath } from '@/shared/lib/timeline/split';

// New Components
import { SubtitleWorkstation, type SubtitleWorkstationHandle } from './subtitle-workstation';
import { VideoPreviewPanel, VideoPreviewRef } from './video-preview-panel';
import { TimelinePanel } from './timeline-panel';

function isAbortError(err: unknown) {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as any;
  if (e.name === 'AbortError' || e.code === 20) return true;
  if (typeof e.message === 'string' && /abort/i.test(e.message)) return true;
  return false;
}

const ABORT_REASON = typeof DOMException !== 'undefined'
  ? new DOMException('Aborted', 'AbortError')
  : Object.assign(new Error('Aborted'), { name: 'AbortError' });

function waitForAudioReady(
  audioEl: HTMLAudioElement,
  opts?: { timeoutMs?: number }
): Promise<boolean> {
  const timeout = opts?.timeoutMs ?? 4000;
  // For preview playback we do not need full-file buffering (`canplaythrough`).
  // Reaching HAVE_CURRENT_DATA / `canplay` is enough to start quickly.
  if (audioEl.readyState >= 2) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    let done = false;
    const cleanup = () => {
      if (done) return;
      done = true;
      audioEl.removeEventListener('loadeddata', onReady);
      audioEl.removeEventListener('canplay', onReady);
      audioEl.removeEventListener('error', onError);
      clearTimeout(timer);
    };
    const onReady = () => { cleanup(); resolve(true); };
    const onError = () => { cleanup(); resolve(false); };
    audioEl.addEventListener('loadeddata', onReady, { once: true });
    audioEl.addEventListener('canplay', onReady, { once: true });
    audioEl.addEventListener('error', onError, { once: true });
    const timer = setTimeout(() => { cleanup(); resolve(false); }, timeout);
  });
}

export default function VideoEditorPage() {
  const params = useParams();
  const convertId = params.id as string;
  const locale = (params.locale as string) || "zh";
  const t = useTranslations('video_convert.videoEditor');
  const tDetail = useTranslations('video_convert.projectDetail');
  const { user } = useAppContext();
  // --- CORE STATE ---
  const [convertObj, setConvertObj] = useState<ConvertObj | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoSource, setVideoSource] = useState<Record<string, any> | null>(null);
  const [taskStatus, setTaskStatus] = useState<string>('pending');
  const [taskErrorMessage, setTaskErrorMessage] = useState<string>('');
  const [taskProgress, setTaskProgress] = useState<number | null>(null);
  const [taskCurrentStep, setTaskCurrentStep] = useState<string>('');

  // Playback State
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSubtitleBuffering, setIsSubtitleBuffering] = useState(false);
  const [isVideoBuffering, setIsVideoBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(60);
  const [volume, setVolume] = useState(80);
  // Zoom
  const [zoom, setZoom] = useState(2);
  const [playingSubtitleIndex, setPlayingSubtitleIndex] = useState<number>(-1);
  const [auditionActiveType, setAuditionActiveType] = useState<'source' | 'convert' | null>(null);
  const [isAutoPlayNext, setIsAutoPlayNext] = useState(false);
  // 服务端持久化：上次“重新合成视频”时刻（用于刷新后恢复 pending 状态）
  const [serverLastMergedAtMs, setServerLastMergedAtMs] = useState(0);
  // 服务端持久化：正在进行中的“重新合成”任务（用于刷新/关闭页面后恢复轮询状态）
  const [serverActiveMergeJob, setServerActiveMergeJob] = useState<{ jobId: string; createdAtMs: number } | null>(null);
  // 本地会话：已“应用配音”但未重新合成的字幕段 id（用于和服务端 pending 合并）
  const [pendingVoiceIds, setPendingVoiceIds] = useState<string[]>([]);
  const [pendingTimingMap, setPendingTimingMap] = useState<Record<string, { startMs: number; endMs: number }>>({});
  const pendingTimingCount = useMemo(() => Object.keys(pendingTimingMap).length, [pendingTimingMap]);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [workstationDirty, setWorkstationDirty] = useState(false);
  const [isSplittingSubtitle, setIsSplittingSubtitle] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const latestOperationIdRef = useRef<string | null>(null);
  const [hasUndoableOps, setHasUndoableOps] = useState(false);
  const [undoCountdown, setUndoCountdown] = useState(0);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const undoLatestOpRef = useRef<any>(null);
  const undoFetchPromiseRef = useRef<Promise<any> | null>(null);

  // --- LAYOUT (keep it user-tunable; defaults should feel roomy) ---
  const LAYOUT_TIMELINE_H_KEY = 'revoice.video_editor.timeline_h_v1';
  const [timelineHeightPx, setTimelineHeightPx] = useState(175);
  const timelineHeightRef = useRef(timelineHeightPx);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const timelineDragRef = useRef<{
    pointerId: number;
    startY: number;
    startHeight: number;
    maxHeight: number;
  } | null>(null);

  useEffect(() => {
    timelineHeightRef.current = timelineHeightPx;
  }, [timelineHeightPx]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LAYOUT_TIMELINE_H_KEY);
      const n = raw ? Number.parseInt(raw, 10) : NaN;
      if (Number.isFinite(n) && n >= 120 && n <= 520) setTimelineHeightPx(n);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!convertId) return;
    fetch(`/api/video-task/operation-history?taskId=${convertId}`)
      .then((r) => r.json())
      .then((d) => {
        const has = d?.data?.some((op: any) => op.rollbackStatus === 0);
        setHasUndoableOps(Boolean(has));
      })
      .catch(() => {});
  }, [convertId]);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      if (undoIntervalRef.current) clearInterval(undoIntervalRef.current);
    };
  }, []);

  // Tracks
  const [videoTrack, setVideoTrack] = useState<TrackItem[]>([]);
  const [bgmTrack, setBgmTrack] = useState<TrackItem[]>([]);
  const [subtitleTrack, setSubtitleTrack] = useState<SubtitleTrackItem[]>([]);
  const [subtitleTrackOriginal, setSubtitleTrackOriginal] = useState<SubtitleTrackItem[]>([]);

  // Mute State
  const [isBgmMuted, setIsBgmMuted] = useState(false);
  const [isSubtitleMuted, setIsSubtitleMuted] = useState(false);

  // Refs for Audio/Video Control
  const videoPreviewRef = useRef<VideoPreviewRef>(null);
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastBgmUrlRef = useRef<string>('');
  // Audio pool for subtitle segments
  const subtitleAudioRef = useRef<HTMLAudioElement | null>(null);
  const subtitleAudio2Ref = useRef<HTMLAudioElement | null>(null);
  const subtitleAudio3Ref = useRef<HTMLAudioElement | null>(null);
  const subtitleAudio4Ref = useRef<HTMLAudioElement | null>(null);
  const subtitleAudio5Ref = useRef<HTMLAudioElement | null>(null);
  const audioRefArr = useMemo(
    () => [
      subtitleAudioRef,
      subtitleAudio2Ref,
      subtitleAudio3Ref,
      subtitleAudio4Ref,
      subtitleAudio5Ref,
    ],
    []
  );

  // Subtitle playback backend: WebAudio (preferred) with HTMLMediaElement fallback.
  // WebAudio is the only "pro-editor" approach that stays stable under rapid segment switching.
  const subtitleBackendRef = useRef<'webaudio' | 'media'>('webaudio');

  // --- WebAudio voice engine (clip-based, no overlap) ---
  const voiceAudioCtxRef = useRef<AudioContext | null>(null);
  const voiceGainRef = useRef<GainNode | null>(null);
  const voiceCacheRef = useRef(new Map<string, { buffer: AudioBuffer; bytes: number }>());
  const voiceCacheBytesRef = useRef(0);
  const voiceInflightRef = useRef(new Map<string, { controller: AbortController; promise: Promise<AudioBuffer> }>());
  const voiceDecodeQueue = useMemo(() => createLimitedTaskQueue(1), []);
  const voiceEpochRef = useRef(0);
  const voiceCurrentRef = useRef<{
    index: number;
    url: string;
    source: AudioBufferSourceNode;
    stopAt: number;
    epoch: number;
  } | null>(null);
  const videoFrameCbIdRef = useRef<number | null>(null);
  const voiceNextRef = useRef<{
    index: number;
    url: string;
    source: AudioBufferSourceNode;
    startAt: number;
    stopAt: number;
    epoch: number;
  } | null>(null);
  const subtitleTrackRef = useRef<SubtitleTrackItem[]>([]);
  const volumeRef = useRef(volume);
  const isSubtitleMutedRef = useRef(isSubtitleMuted);
  const isPlayingRef = useRef(isPlaying);
  const isSubtitleBufferingRef = useRef(isSubtitleBuffering);
  const isBgmMutedRef = useRef(isBgmMuted);
  const bufferingAbortRef = useRef<AbortController | null>(null);
  const pausePrefetchAbortRef = useRef<AbortController | null>(null);
  const lastVoiceSubtitleIndexRef = useRef<number>(-1);
  const lastVoiceSyncMsRef = useRef<number>(0);

  const rafIdRef = useRef<number | null>(null);
  const lastUiTimeRef = useRef<number>(-1);
  const lastPlayedSubtitleIndexRef = useRef<number>(-1);
  // Monotonic token to ignore stale `play()` promise rejections.
  const subtitlePlayTokenRef = useRef(0);
  // Avoid tight play/pause loops when the browser/network needs a moment.
  const subtitleRetryRef = useRef<{ index: number; untilMs: number } | null>(null);
  // Watchdog: if we're in a segment but the audio is silent, kick a resync (throttled).
  const subtitleWatchdogMsRef = useRef(0);
  // Grace window after seek/resume to avoid restarting the same segment in a tight loop.
  const subtitleGraceUntilMsRef = useRef(0);
  // Track when we last attempted to start a segment (for per-segment grace).
  const subtitleKickRef = useRef<{ index: number; atMs: number } | null>(null);
  const isAudioRefArrPause = useRef(false); // Flag for drag operations
  const workstationRef = useRef<SubtitleWorkstationHandle>(null);
  // Ignore stale video `play()` promise resolutions/rejections when users toggle quickly.
  const videoPlayTokenRef = useRef(0);

  const auditionStopAtMsRef = useRef<number | null>(null);
  const auditionActiveTypeRef = useRef<'source' | 'convert' | null>(null);
  const auditionTokenRef = useRef(0);
  const isAutoPlayNextRef = useRef(false);
  const playingSubtitleIndexRef = useRef<number>(-1);
  const sourceAuditionAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    isAutoPlayNextRef.current = isAutoPlayNext;
  }, [isAutoPlayNext]);
  // 试听期间临时覆盖静音状态，结束时恢复
  const auditionRestoreRef = useRef<{
    subtitleMuted: boolean;
    bgmMuted: boolean;
    videoMuted: boolean;
  } | null>(null);

  // Video transport buffering (waiting/stalled/seeking). When true, we freeze audio transport.
  const transportIsStalledRef = useRef(false);
  // Debounce <video> stall signals: short "waiting" blips shouldn't tear down transport.
  const transportStallTimerRef = useRef<number | null>(null);
  const bgmKickMsRef = useRef(0);
  // Start/Resume gate token for "buffer-before-play" logic.
  const videoStartGateTokenRef = useRef(0);

  // Seek-drag throttling: avoid thrashing audio/video state on every pointer move.
  const seekDragActiveRef = useRef(false);
  const seekDragRafRef = useRef<number | null>(null);
  const seekDragLatestTimeRef = useRef(0);
  const seekDragLastMediaApplyMsRef = useRef(0);
  const handlePendingVoiceIdsChange = useCallback((ids: string[]) => {
    setPendingVoiceIds(ids);
  }, []);

  // Auto-save timing edits to server (debounced 3s) so they survive page leave.
  const autoSaveTimingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (Object.keys(pendingTimingMap).length === 0) return;
    if (autoSaveTimingRef.current) clearTimeout(autoSaveTimingRef.current);
    autoSaveTimingRef.current = setTimeout(async () => {
      autoSaveTimingRef.current = null;
      const items = Object.entries(pendingTimingMap).map(([id, v]) => ({
        id, startMs: v.startMs, endMs: v.endMs,
      }));
      try {
        const resp = await fetch('/api/video-task/update-subtitle-timings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: convertId, stepName: 'translate_srt', items }),
        });
        const back = await resp.json().catch(() => null);
        if (resp.ok && back?.code === 0) {
          const idMap = (back?.data?.idMap ?? {}) as Record<string, string>;
          const touchedIds = new Set(items.map((it) => it.id));
          const savedAtMs = Date.now();
          setConvertObj((prevObj) => {
            if (!prevObj) return prevObj;
            const arr = (prevObj.srt_convert_arr || []) as any[];
            const nextArr = arr.map((row) => {
              const id = row?.id;
              if (typeof id !== 'string') return row;
              const mapped = idMap?.[id];
              const nextId = typeof mapped === 'string' && mapped.length > 0 ? mapped : id;
              const shouldMark = touchedIds.has(id);
              if (nextId === id && !shouldMark) return row;
              const out = { ...row };
              if (nextId !== id) out.id = nextId;
              if (shouldMark) out.timing_rev_ms = savedAtMs;
              return out;
            });
            return { ...prevObj, srt_convert_arr: nextArr };
          });
          setPendingTimingMap({});
        }
      } catch { /* best-effort */ }
    }, 3000);
    return () => {
      if (autoSaveTimingRef.current) clearTimeout(autoSaveTimingRef.current);
    };
  }, [pendingTimingMap, convertId]);

  const cancelUpdateLoop = useCallback(() => {
    const videoEl = videoPreviewRef.current?.videoElement as any;
    const vfcId = videoFrameCbIdRef.current;
    if (videoEl && vfcId != null && typeof videoEl.cancelVideoFrameCallback === 'function') {
      try {
        videoEl.cancelVideoFrameCallback(vfcId);
      } catch {
        // ignore
      }
    }
    videoFrameCbIdRef.current = null;

    const rafId = rafIdRef.current;
    if (rafId != null) {
      cancelAnimationFrame(rafId);
    }
    rafIdRef.current = null;
  }, []);

  const formatSecondsToSrtTime = useCallback((seconds: number) => {
    const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
    const totalMs = Math.round(safe * 1000);
    const ms = totalMs % 1000;
    const totalSec = (totalMs - ms) / 1000;
    const sec = totalSec % 60;
    const totalMin = (totalSec - sec) / 60;
    const min = totalMin % 60;
    const h = (totalMin - min) / 60;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }, []);

  const handleSubtitleTrackChange = useCallback((nextTrack: SubtitleTrackItem[]) => {
    const nextById = new Map(nextTrack.map((x) => [x.id, x]));

    setSubtitleTrack((prev) => {
      const changedIds: string[] = [];
      for (const p of prev) {
        const n = nextById.get(p.id);
        if (!n) continue;
        if (Math.abs(p.startTime - n.startTime) > 1e-3 || Math.abs(p.duration - n.duration) > 1e-3) {
          changedIds.push(p.id);
        }
      }

      if (changedIds.length > 0) {
        setPendingTimingMap((prevMap) => {
          const copy: Record<string, { startMs: number; endMs: number }> = { ...prevMap };
          for (const id of changedIds) {
            const item = nextById.get(id);
            if (!item) continue;
            const startMs = Math.round(item.startTime * 1000);
            const endMs = Math.round((item.startTime + item.duration) * 1000);
            copy[id] = { startMs, endMs };
          }
          return copy;
        });

        // Keep the right-side list (convertObj.srt_convert_arr) in sync with the edited timings.
        setConvertObj((prevObj) => {
          if (!prevObj) return prevObj;
          const arr = (prevObj.srt_convert_arr || []) as any[];
          const nextArr = arr.map((row) => {
            const id = row?.id;
            if (typeof id !== 'string') return row;
            const item = nextById.get(id);
            if (!item) return row;
            const start = formatSecondsToSrtTime(item.startTime);
            const end = formatSecondsToSrtTime(item.startTime + item.duration);
            if (row.start === start && row.end === end) return row;
            return { ...row, start, end };
          });
          return { ...prevObj, srt_convert_arr: nextArr };
        });
      }

      return nextTrack;
    });
  }, [formatSecondsToSrtTime]);

  // --- 1. DATA FETCHING ---
  useEffect(() => {
    const fetchConvertDetail = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/video-task/editVideoAudiosubtitleDetail?taskMainId=${convertId}`);
        if (!response.ok) throw new Error(t('error.fetchFailed'));

        const result = await response.json();
        if (result.code === '0') {
          if (result.videoItem) setVideoSource(result.videoItem);
          if (result.taskMainItem) {
            setConvertObj({ ...result.taskMainItem, r2preUrl: result.publicBaseUrl, env: result.env });
            setTaskStatus(result.taskMainItem.status || 'pending');
            setTaskErrorMessage(result.taskMainItem.errorMessage || '');
            setTaskProgress(Number.isFinite(Number(result.taskMainItem.progress)) ? Number(result.taskMainItem.progress) : null);
            setTaskCurrentStep(result.taskMainItem.currentStep || '');
          }
        } else {
          throw new Error(result.msg || t('error.dataFormatError'));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('error.fetchFailed'));
      } finally {
        setIsLoading(false);
      }
    };
    if (convertId) fetchConvertDetail();
  }, [convertId]);

  // 切换任务时重置本地“重新合成”相关状态（避免串任务）
  useEffect(() => {
    setServerLastMergedAtMs(0);
    setServerActiveMergeJob(null);
    setPendingVoiceIds([]);
    setPendingTimingMap({});
  }, [convertId]);

  // 从 vt_task_main.metadata 恢复“上次重新合成基线时间”（刷新/关闭页面后仍可计算 pending）
  useEffect(() => {
    const metaRaw = (convertObj as any)?.metadata;
    if (!metaRaw) return;

    let meta: any = null;
    try {
      meta = typeof metaRaw === 'string' ? JSON.parse(metaRaw) : metaRaw;
    } catch {
      meta = null;
    }
    if (!meta || typeof meta !== 'object') return;

    const lastMergedAtMsRaw =
      meta?.videoMerge?.lastSuccess?.mergedAtMs ??
      meta?.videoMerge?.lastSuccess?.merged_at_ms ??
      meta?.videoMerge?.lastMergedAtMs ??
      meta?.videoMerge?.last_merged_at_ms ??
      meta?.video_merge?.lastMergedAtMs ??
      meta?.video_merge?.last_merged_at_ms;

    const lastMergedAtMs =
      typeof lastMergedAtMsRaw === 'number'
        ? lastMergedAtMsRaw
        : Number.parseInt(String(lastMergedAtMsRaw || ''), 10);

    if (Number.isFinite(lastMergedAtMs) && lastMergedAtMs > 0) {
      // 单调递增：避免“后端尚未落库/元数据回写延迟”导致 UI 回退
      setServerLastMergedAtMs((prev) => Math.max(prev, lastMergedAtMs));
    }

    // 恢复 active merge job（用于刷新后继续轮询状态）
    const activeRaw =
      meta?.videoMerge?.active ??
      meta?.video_merge?.active ??
      null;
    const activeJobIdRaw = activeRaw?.jobId ?? activeRaw?.job_id;
    const activeCreatedAtMsRaw = activeRaw?.createdAtMs ?? activeRaw?.created_at_ms;
    const activeState = String(activeRaw?.state || '').toLowerCase();

    const activeJobId = typeof activeJobIdRaw === 'string' ? activeJobIdRaw.trim() : '';
    const activeCreatedAtMs =
      typeof activeCreatedAtMsRaw === 'number'
        ? activeCreatedAtMsRaw
        : Number.parseInt(String(activeCreatedAtMsRaw || ''), 10);

    if (activeJobId && (!activeState || activeState === 'pending')) {
      setServerActiveMergeJob({
        jobId: activeJobId,
        createdAtMs: Number.isFinite(activeCreatedAtMs) && activeCreatedAtMs > 0 ? activeCreatedAtMs : 0,
      });
    } else {
      setServerActiveMergeJob(null);
    }
  }, [convertObj]);

  // 刷新/关页后恢复：如果存在 active merge job，则继续轮询直至成功/失败/超时
  useEffect(() => {
    if (!convertId) return;
    const jobId = serverActiveMergeJob?.jobId || '';
    if (!jobId) return;

    let cancelled = false;
    const startedAt = Date.now();
    const timeoutMs = 60 * 60 * 1000;
    const baselineMergedAtMs = serverActiveMergeJob?.createdAtMs || Date.now();

    const tick = async () => {
      try {
        const resp = await fetch(
          `/api/video-task/generate-video?taskId=${encodeURIComponent(convertId)}&jobId=${encodeURIComponent(jobId)}&mode=status`
        );
        const back = await resp.json().catch(() => null);
        if (cancelled) return;
        if (back?.code !== 0) return;

        const st = back?.data?.status;
        if (st === 'success') {
          toast.success(t('audioList.toast.videoSaveCompleted'), { duration: 5000 });
          setServerLastMergedAtMs((prev) => Math.max(prev, baselineMergedAtMs));
          setServerActiveMergeJob(null);
          return;
        }
        if (st === 'failed') {
          const msg = back?.data?.errorMessage || back?.data?.message || '';
          toast.error(msg || t('audioList.toast.videoSaveFailed'));
          setServerActiveMergeJob(null);
          return;
        }
      } catch {
        // keep polling (best-effort)
      }
    };

    void tick();
    const timer = setInterval(() => {
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        if (!cancelled) {
          toast.error(t('audioList.toast.videoSaveFailed'));
          setServerActiveMergeJob(null);
        }
        return;
      }
      void tick();
    }, 4000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [convertId, serverActiveMergeJob?.createdAtMs, serverActiveMergeJob?.jobId, t]);

  // Lightweight polling for status changes (queued/processing/completed/failed).
  useEffect(() => {
    if (!convertId) return;
    if (taskStatus !== 'pending' && taskStatus !== 'processing') return;

    let cancelled = false;
    const tick = async () => {
      try {
        const resp = await fetch(`/api/video-task/getTaskProgress?taskId=${convertId}`);
        const back = await resp.json();
        const item = back?.data?.taskItem;
        if (cancelled) return;
        if (back?.code === 0 && item?.id) {
          setTaskStatus(item.status || 'pending');
          setTaskErrorMessage(item.errorMessage || '');
          setTaskProgress(Number.isFinite(Number(item.progress)) ? Number(item.progress) : null);
          setTaskCurrentStep(item.currentStep || '');
        }
      } catch {
        // Silent: the editor should stay usable even if polling fails.
      }
    };

    void tick();
    const timer = setInterval(tick, 10000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [convertId, taskStatus]);

  const statusMeta = useMemo(() => {
    const map: Record<string, { label: string; cls: string; icon: 'dot' | 'spin' | 'check' | 'x' }> = {
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
    return map[taskStatus] || { label: taskStatus, cls: 'border-white/10 bg-white/[0.03] text-muted-foreground', icon: 'dot' as const };
  }, [tDetail, taskStatus]);

  const progressPercent = useMemo(() => {
    return estimateTaskPercent({
      status: taskStatus,
      progress: taskProgress ?? convertObj?.progress,
      currentStep: taskCurrentStep || convertObj?.currentStep,
    });
  }, [convertObj?.currentStep, convertObj?.progress, taskCurrentStep, taskProgress, taskStatus]);

  const isTaskRunning = taskStatus === 'pending' || taskStatus === 'processing';
  const headerProgressFillCls = useMemo(() => {
    if (taskStatus === 'completed') return 'bg-emerald-500/70';
    if (taskStatus === 'failed' || taskStatus === 'cancelled') return 'bg-destructive/70';
    if (taskStatus === 'processing') return 'bg-primary/80';
    return 'bg-primary/55';
  }, [taskStatus]);

  const headerProgressVisual = isTaskRunning ? Math.max(3, progressPercent) : progressPercent;

  const handleVideoMergeCompleted = useCallback((args: { mergedAtMs: number }) => {
    const mergedAtMs = args?.mergedAtMs;
    if (!Number.isFinite(mergedAtMs) || mergedAtMs <= 0) return;
    setServerLastMergedAtMs((prev) => Math.max(prev, Math.round(mergedAtMs)));
  }, []);

  const handleVideoMergeStarted = useCallback((args: { jobId: string; createdAtMs: number }) => {
    setServerActiveMergeJob(args);
  }, []);

  const handleVideoMergeFailed = useCallback(() => {
    setServerActiveMergeJob(null);
  }, []);

  const isMergeJobActive = serverActiveMergeJob !== null;

  const serverMergePending = useMemo(() => {
    const audio = new Set<string>();
    const timing = new Set<string>();
    const any = new Set<string>();
    const arr = (convertObj?.srt_convert_arr ?? []) as any;
    const list: any[] = Array.isArray(arr) ? arr : [];
    const baseline = serverLastMergedAtMs;

    const parseMs = (v: any) => {
      if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : 0;
      const n = Number.parseInt(String(v || ''), 10);
      return Number.isFinite(n) ? n : 0;
    };

    for (const row of list) {
      const id = row?.id;
      if (typeof id !== 'string' || id.length === 0) continue;
      const audioRev = parseMs(row?.audio_rev_ms);
      const timingRev = parseMs(row?.timing_rev_ms);
      if (audioRev > baseline) audio.add(id);
      if (timingRev > baseline) timing.add(id);
      if (Math.max(audioRev, timingRev) > baseline) any.add(id);
    }

    return { audio, timing, any };
  }, [convertObj?.srt_convert_arr, serverLastMergedAtMs]);

  const explicitMissingVoiceIdSet = useMemo(() => {
    return new Set(collectMissingVoiceIds((convertObj?.srt_convert_arr || []) as any[]));
  }, [convertObj?.srt_convert_arr]);

  const localPendingVoiceIdSet = useMemo(() => {
    const out = new Set<string>();
    for (const id of pendingVoiceIds) {
      if (typeof id === 'string' && id.length > 0) out.add(id);
    }
    return out;
  }, [pendingVoiceIds]);

  // 右上角按钮“待重新合成”的计算：本地 pending + 服务端 pending（刷新后仍可恢复）+ 显式缺音频
  const pendingVoiceIdSet = useMemo(() => {
    const out = new Set<string>();
    for (const id of serverMergePending.audio) out.add(id);
    for (const id of localPendingVoiceIdSet) out.add(id);
    for (const id of explicitMissingVoiceIdSet) out.add(id);
    return out;
  }, [explicitMissingVoiceIdSet, localPendingVoiceIdSet, serverMergePending.audio]);

  const pendingTimingIdSet = useMemo(() => {
    const out = new Set<string>();
    for (const id of serverMergePending.timing) out.add(id);
    for (const id of Object.keys(pendingTimingMap)) out.add(id);
    return out;
  }, [pendingTimingMap, serverMergePending.timing]);

  const pendingMergeIdSet = useMemo(() => {
    const out = new Set<string>();
    for (const id of pendingVoiceIdSet) out.add(id);
    for (const id of pendingTimingIdSet) out.add(id);
    return out;
  }, [pendingTimingIdSet, pendingVoiceIdSet]);

  const pendingMergeCount = pendingMergeIdSet.size;
  const pendingMergeVoiceCount = pendingVoiceIdSet.size;
  const pendingMergeTimingCount = pendingTimingIdSet.size;

  const hasUnsavedChanges = workstationDirty || pendingMergeCount > 0 || pendingTimingCount > 0;
  const router = useRouter();
  const { showLeaveDialog, confirmLeave, cancelLeave } = useUnsavedChangesGuard(hasUnsavedChanges);

  const backUrl = convertObj?.originalFileId
    ? `/dashboard/projects/${convertObj.originalFileId}`
    : '/dashboard/projects';

  const handleBackClick = useCallback(() => {
    // When hasUnsavedChanges is true, router.push triggers the
    // monkey-patched pushState which shows the leave dialog automatically.
    router.push(backUrl);
  }, [backUrl, router]);

  // --- 2. TRACK INITIALIZATION ---
  useEffect(() => {
    if (!convertObj) return;

    const loadResources = () => {
      const parseTime = (str: string) => {
        if (!str || typeof str !== 'string') return 0;
        const parts = str.split(':');
        if (parts.length !== 3) return 0;
        const [h, m, s] = parts;
        const [sec, ms] = (s || '0').split(/[.,]/);
        const hh = Number.parseInt(h || '0', 10) || 0;
        const mm = Number.parseInt(m || '0', 10) || 0;
        const ss = Number.parseInt(sec || '0', 10) || 0;
        const mss = Number.parseInt(ms || '0', 10) || 0;
        return hh * 3600 + mm * 60 + ss + mss / 1000;
      };

      // 1. Video Track
      if (convertObj.noSoundVideoUrl) {
        setVideoTrack([{
          id: 'video-main', type: 'video', name: t('videoEditor.tracks.mainVideo'),
          // Use the signed URL directly. Proxying full media through Next can introduce buffering/stutter.
          url: convertObj.noSoundVideoUrl, startTime: 0, duration: convertObj.processDurationSeconds, volume: 100
        }]);
      }
      // 2. BGM Track
      if (convertObj.backgroundAudioUrl) {
        setBgmTrack([{
          id: 'bgm-main', type: 'bgm', name: t('videoEditor.tracks.bgm'),
          url: convertObj.backgroundAudioUrl, startTime: 0, duration: convertObj.processDurationSeconds, volume: 80
        }]);
      }
      // 3. Subtitle Track
      if (convertObj.srt_convert_arr?.length) {
        const items: SubtitleTrackItem[] = convertObj.srt_convert_arr.map((entry, index) => {
          const start = parseTime(entry.start);
          const end = parseTime(entry.end);
          const userId = convertObj.userId || '';
          const draftPathRaw =
            typeof (entry as any)?.vap_draft_audio_path === 'string'
              ? String((entry as any).vap_draft_audio_path || '').trim()
              : '';
          const draftPath = draftPathRaw ? draftPathRaw.split('?')[0] : '';
          const pathName = resolveSplitTranslatedAudioPath({ ...entry, vap_draft_audio_path: draftPath });

          const updatedAtMsRaw = (entry as any)?.vap_tts_updated_at_ms;
          const updatedAtMs =
            typeof updatedAtMsRaw === 'number'
              ? updatedAtMsRaw
              : Number.parseInt(String(updatedAtMsRaw || ''), 10);
          const cacheBuster =
            Number.isFinite(updatedAtMs) && updatedAtMs > 0 ? String(updatedAtMs) : '';

          const base = pathName
            ? (/^https?:\/\//i.test(pathName)
              ? pathName
              : `${convertObj.r2preUrl}/${convertObj.env}/${userId}/${convertObj.id}/${pathName}`)
            : '';
          const audioUrl = !base
            ? ''
            : (cacheBuster
              ? `${base}${base.includes('?') ? '&' : '?'}t=${encodeURIComponent(cacheBuster)}`
              : base);
          const draftTxt = typeof (entry as any)?.vap_draft_txt === 'string' ? String((entry as any).vap_draft_txt || '') : '';
          const splitOperationId = typeof (entry as any)?.vap_split_operation_id === 'string' && (entry as any).vap_split_operation_id
            ? String((entry as any).vap_split_operation_id)
            : undefined;
          return {
            id: entry.id, type: 'video', name: `Sub ${index + 1}`,
            startTime: start, duration: Math.max(0, end - start), text: draftTxt || entry.txt,
            fontSize: 16, color: '#ffffff', audioUrl,
            splitOperationId,
          };
        });
        setSubtitleTrack(items);
      }

      // 4. Original subtitle track (reference-only on the timeline)
      if (convertObj.srt_source_arr?.length) {
        const items: SubtitleTrackItem[] = convertObj.srt_source_arr.map((entry, index) => {
          const start = parseTime(entry.start);
          const end = parseTime(entry.end);
          return {
            id: entry.id,
            type: 'audio',
            name: `Src ${index + 1}`,
            startTime: start,
            duration: Math.max(0, end - start),
            text: entry.txt || '',
          };
        });
        setSubtitleTrackOriginal(items);
      } else {
        setSubtitleTrackOriginal([]);
      }
      setTotalDuration(convertObj.processDurationSeconds);
    };
    loadResources();
  }, [convertObj]);

  // --- 3. LAYOUT EFFECTS ---
  useEffect(() => {
    // Init Audio Elements
    bgmAudioRef.current = new Audio();
    bgmAudioRef.current.preload = 'auto';
    audioRefArr.forEach((ref) => {
      const a = new Audio();
      a.preload = 'auto';
      ref.current = a;
    });

    return () => {
      cancelUpdateLoop();
      bgmAudioRef.current?.pause();
      audioRefArr.forEach(ref => ref.current?.pause());
      try { sourceAuditionAudioRef.current?.pause(); } catch { /* ignore */ }
    };
  }, [audioRefArr, cancelUpdateLoop]);

  // Keep BGM audio element loaded with the current track URL (if any).
  useEffect(() => {
    const audio = bgmAudioRef.current;
    if (!audio) return;

    const url = bgmTrack[0]?.url;
    if (!url) {
      lastBgmUrlRef.current = '';
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      return;
    }

    if (lastBgmUrlRef.current === url) return;
    lastBgmUrlRef.current = url;
    audio.preload = 'auto';
    audio.src = url;
    audio.load();
  }, [bgmTrack]);

  // Preconnect to media origins (video + public bucket) to shave off the initial TLS/handshake cost.
  // This is front-end only, safe, and helps both editor + detail views when users jump between pages.
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const urls = [
      videoTrack[0]?.url,
      bgmTrack[0]?.url,
      convertObj?.r2preUrl,
    ]
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean);

    const origins = new Set<string>();
    for (const u of urls) {
      try {
        origins.add(new URL(u).origin);
      } catch {
        // ignore
      }
    }

    for (const origin of origins) {
      const key = `revoice-preconnect:${origin}`;
      if (document.head.querySelector(`link[data-revoice-hint="${CSS.escape(key)}"]`)) continue;

      const pre = document.createElement('link');
      pre.rel = 'preconnect';
      pre.href = origin;
      pre.crossOrigin = 'anonymous';
      pre.dataset.revoiceHint = key;
      document.head.appendChild(pre);

      const dns = document.createElement('link');
      dns.rel = 'dns-prefetch';
      dns.href = origin;
      dns.dataset.revoiceHint = key;
      document.head.appendChild(dns);
    }
  }, [bgmTrack, convertObj?.r2preUrl, videoTrack]);

  // --- 4. PLAYBACK LOGIC (The Core Engine) ---

  useEffect(() => {
    subtitleTrackRef.current = subtitleTrack;
  }, [subtitleTrack]);

  useEffect(() => {
    volumeRef.current = volume;
    isSubtitleMutedRef.current = isSubtitleMuted;
    const g = voiceGainRef.current;
    if (g) {
      // Keep WebAudio voice volume in sync with the global output slider.
      g.gain.value = isSubtitleMuted ? 0 : volume / 100;
    }
  }, [isSubtitleMuted, volume]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    isSubtitleBufferingRef.current = isSubtitleBuffering;
  }, [isSubtitleBuffering]);

  useEffect(() => {
    isBgmMutedRef.current = isBgmMuted;
  }, [isBgmMuted]);

  const stopWebAudioVoice = useCallback(() => {
    voiceEpochRef.current += 1;
    const cur = voiceCurrentRef.current;
    const next = voiceNextRef.current;
    voiceCurrentRef.current = null;
    voiceNextRef.current = null;

    for (const item of [cur, next]) {
      if (!item) continue;
      try {
        item.source.onended = null;
      } catch {
        // ignore
      }
      try {
        item.source.stop(0);
      } catch {
        // ignore
      }
      try {
        item.source.disconnect();
      } catch {
        // ignore
      }
    }
  }, []);

  // Stop only the currently playing WebAudio voice clip, but keep any pre-scheduled "next" clip.
  // This is important when the transport is in a gap: we want silence now, but still allow a
  // precise upcoming start without tearing down the schedule every frame.
  const stopWebAudioVoiceCurrent = useCallback(() => {
    const cur = voiceCurrentRef.current;
    voiceCurrentRef.current = null;
    if (!cur) return;
    voiceEpochRef.current += 1;
    try {
      cur.source.onended = null;
    } catch {
      // ignore
    }
    try {
      cur.source.stop(0);
    } catch {
      // ignore
    }
    try {
      cur.source.disconnect();
    } catch {
      // ignore
    }
  }, []);

  const abortAllVoiceInflight = useCallback(() => {
    try { bufferingAbortRef.current?.abort(ABORT_REASON); } catch { /* ignore */ }
    bufferingAbortRef.current = null;
    try { pausePrefetchAbortRef.current?.abort(ABORT_REASON); } catch { /* ignore */ }
    pausePrefetchAbortRef.current = null;
    const entries = Array.from(voiceInflightRef.current.values());
    voiceInflightRef.current.clear();
    for (const v of entries) {
      try { v.controller.abort(ABORT_REASON); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    return () => {
      stopWebAudioVoice();
      abortAllVoiceInflight();
      const ctx = voiceAudioCtxRef.current;
      voiceAudioCtxRef.current = null;
      voiceGainRef.current = null;
      if (ctx && typeof ctx.close === 'function') {
        try {
          void ctx.close();
        } catch {
          // ignore
        }
      }
    };
  }, [abortAllVoiceInflight, stopWebAudioVoice]);

  const getOrCreateVoiceAudioCtx = useCallback(() => {
    const Ctx = (globalThis as any).AudioContext || (globalThis as any).webkitAudioContext;
    if (!Ctx) throw new Error('WebAudio not supported');
    if (voiceAudioCtxRef.current) return voiceAudioCtxRef.current;

    const ctx: AudioContext = new Ctx({ latencyHint: 'interactive' });
    voiceAudioCtxRef.current = ctx;

    const gain = ctx.createGain();
    gain.gain.value = isSubtitleMutedRef.current ? 0 : volumeRef.current / 100;
    gain.connect(ctx.destination);
    voiceGainRef.current = gain;

    return ctx;
  }, []);

  const estimateAudioBufferBytes = useCallback((buf: AudioBuffer) => {
    // Float32 per sample.
    return buf.length * buf.numberOfChannels * 4;
  }, []);

  const getAdaptiveBufferPolicy = useCallback(() => {
    const defaults = {
      startBufferSeconds: 2,
      playPrefetchCount: 6,
      pausePrefetchCount: 8,
      mediaLookaheadCount: 4,
      webAudioDecodeLookaheadCount: 3,
      voiceCacheMaxBytes: 28 * 1024 * 1024,
    };

    if (typeof window === 'undefined' || typeof navigator === 'undefined') return defaults;

    const conn = (navigator as any)?.connection;
    const saveData = Boolean(conn?.saveData);
    const effectiveType = String(conn?.effectiveType || '').toLowerCase();
    const deviceMemoryRaw = Number((navigator as any)?.deviceMemory);
    const deviceMemory = Number.isFinite(deviceMemoryRaw) && deviceMemoryRaw > 0 ? deviceMemoryRaw : null;
    const coarse =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: coarse)').matches;

    const verySlowNetwork = effectiveType === 'slow-2g' || effectiveType === '2g';
    const slowNetwork = effectiveType === '3g';
    const lowMemory = deviceMemory != null && deviceMemory <= 2;
    const midMemory = deviceMemory != null && deviceMemory <= 4;

    if (saveData || verySlowNetwork || lowMemory) {
      return {
        startBufferSeconds: 5,
        playPrefetchCount: 3,
        pausePrefetchCount: 4,
        mediaLookaheadCount: 2,
        webAudioDecodeLookaheadCount: 1,
        voiceCacheMaxBytes: 14 * 1024 * 1024,
      };
    }

    if (slowNetwork || midMemory || coarse) {
      return {
        startBufferSeconds: 4,
        playPrefetchCount: 4,
        pausePrefetchCount: 6,
        mediaLookaheadCount: 3,
        webAudioDecodeLookaheadCount: 2,
        voiceCacheMaxBytes: 20 * 1024 * 1024,
      };
    }

    return defaults;
  }, []);

  const cacheGetVoice = useCallback((key: string) => {
    const cache = voiceCacheRef.current;
    const hit = cache.get(key);
    if (!hit) return null;
    // LRU bump.
    cache.delete(key);
    cache.set(key, hit);
    return hit.buffer;
  }, []);

  const cacheSetVoice = useCallback((key: string, buffer: AudioBuffer) => {
    const cache = voiceCacheRef.current;
    const bytes = estimateAudioBufferBytes(buffer);

    const prev = cache.get(key);
    if (prev) {
      voiceCacheBytesRef.current -= prev.bytes;
      cache.delete(key);
    }

    cache.set(key, { buffer, bytes });
    voiceCacheBytesRef.current += bytes;

    // Voice cache uses an adaptive cap to protect low-memory devices from jank.
    const maxBytes = getAdaptiveBufferPolicy().voiceCacheMaxBytes;
    while (voiceCacheBytesRef.current > maxBytes && cache.size > 1) {
      const oldestKey = cache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      const oldest = cache.get(oldestKey);
      cache.delete(oldestKey);
      if (oldest) voiceCacheBytesRef.current -= oldest.bytes;
    }
  }, [estimateAudioBufferBytes, getAdaptiveBufferPolicy]);

  const toWebAudioFetchUrl = useCallback((raw: string) => {
    const s = (raw || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) return s;
    try {
      const u = new URL(s);
      const allowed =
        u.hostname.endsWith('.r2.cloudflarestorage.com') ||
        u.hostname.endsWith('.r2.dev');
      return allowed ? `/api/storage/proxy?src=${encodeURIComponent(s)}` : s;
    } catch {
      return s;
    }
  }, []);

  const fetchAudioArrayBuffer = useCallback(async (raw: string, signal: AbortSignal) => {
    const abortErr = () => { const e = new Error('Aborted'); e.name = 'AbortError'; return e; };
    const direct = async (url: string) => {
      if (signal.aborted) throw abortErr();
      const resp = await fetch(url, { signal }).catch((e: unknown) => {
        if (signal.aborted) throw abortErr();
        throw e;
      });
      if (!resp.ok) throw new Error(`fetch failed: ${resp.status}`);
      return await resp.arrayBuffer();
    };

    try {
      return await direct(raw);
    } catch (e) {
      if (signal.aborted) throw abortErr();
      const proxy = toWebAudioFetchUrl(raw);
      if (proxy && proxy !== raw) return await direct(proxy);
      throw e;
    }
  }, [toWebAudioFetchUrl]);

  const decodeVoiceBuffer = useCallback(async (url: string, signal: AbortSignal) => {
    const ctx = getOrCreateVoiceAudioCtx();
    const ab = await fetchAudioArrayBuffer(url, signal);
    if (signal.aborted) { const e = new Error('Aborted'); e.name = 'AbortError'; throw e; }

    // Some browsers detach the buffer; pass a copy.
    const input = ab.slice(0);
    const maybePromise = (ctx as any).decodeAudioData(input);
    if (maybePromise && typeof maybePromise.then === 'function') {
      return (await maybePromise) as AudioBuffer;
    }
    return await new Promise<AudioBuffer>((resolve, reject) => {
      try {
        ctx.decodeAudioData(input, resolve, reject);
      } catch (err) {
        reject(err);
      }
    });
  }, [fetchAudioArrayBuffer, getOrCreateVoiceAudioCtx]);

  const ensureVoiceBuffer = useCallback(async (url: string, signal: AbortSignal) => {
    const key = (url || '').trim();
    if (!key) throw new Error('missing url');

    const cached = cacheGetVoice(key);
    if (cached) return cached;

    const inflight = voiceInflightRef.current.get(key);
    if (inflight) return await inflight.promise;

    const controller = new AbortController();
    const onAbort = () => {
      try { controller.abort(ABORT_REASON); } catch { /* ignore */ }
    };
    if (signal.aborted) {
      try { controller.abort(ABORT_REASON); } catch { /* ignore */ }
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    const promise = voiceDecodeQueue
      .enqueue((queueSignal) => decodeVoiceBuffer(key, queueSignal), controller.signal)
      .then((buf) => {
        if (signal.aborted) return undefined as unknown as AudioBuffer;
        cacheSetVoice(key, buf);
        return buf;
      })
      .catch(() => undefined as unknown as AudioBuffer)
      .finally(() => {
        voiceInflightRef.current.delete(key);
        try { signal.removeEventListener('abort', onAbort); } catch { /* ignore */ }
      });

    voiceInflightRef.current.set(key, { controller, promise });
    return await promise;
  }, [cacheGetVoice, cacheSetVoice, decodeVoiceBuffer, voiceDecodeQueue]);

  const findSubtitleIndexAtTime = useCallback((track: SubtitleTrackItem[], time: number) => {
    if (!track.length) return -1;
    let lo = 0;
    let hi = track.length - 1;
    let best = -1;
    const target = time;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (track[mid].startTime <= target) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    if (best < 0) return -1;
    const sub = track[best];
    const end = sub.startTime + sub.duration;
    return time >= sub.startTime && time < end ? best : -1;
  }, []);

  const findNextSubtitleIndexAtOrAfterTime = useCallback((track: SubtitleTrackItem[], time: number) => {
    if (!track.length) return -1;
    let lo = 0;
    let hi = track.length - 1;
    let best = track.length;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (track[mid].startTime >= time) {
        best = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return best < track.length ? best : -1;
  }, []);

  // For prefetch: find the nearest clip start at or before `time` (even if we're in a gap).
  const findSubtitleStartIndexForPrefetch = useCallback((track: SubtitleTrackItem[], time: number) => {
    if (!track.length) return 0;
    let lo = 0;
    let hi = track.length - 1;
    let best = -1;
    const target = time;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (track[mid].startTime <= target) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return Math.max(0, best);
  }, []);

  const getPrefetchSubtitleUrls = useCallback((time: number, count: number = 6) => {
    const track = subtitleTrackRef.current;
    if (!track.length) return [] as string[];

    const anchor = Number.isFinite(time) ? Math.max(0, time) : 0;
    const startIdx = findSubtitleStartIndexForPrefetch(track, anchor);
    const maxCount = Math.max(1, count);
    const out: string[] = [];
    const seen = new Set<string>();

    for (let k = 0; k < maxCount; k += 1) {
      const seg = track[startIdx + k];
      const url = (seg?.audioUrl || '').trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      out.push(url);
    }

    return out;
  }, [findSubtitleStartIndexForPrefetch]);

  const getAdaptivePrefetchCount = useCallback((mode: 'play' | 'pause' | 'lookahead') => {
    const p = getAdaptiveBufferPolicy();
    if (mode === 'play') return p.playPrefetchCount;
    if (mode === 'pause') return p.pausePrefetchCount;
    return p.mediaLookaheadCount;
  }, [getAdaptiveBufferPolicy]);

  const getAdaptiveWebAudioDecodeLookaheadCount = useCallback(() => {
    return getAdaptiveBufferPolicy().webAudioDecodeLookaheadCount;
  }, [getAdaptiveBufferPolicy]);

  const prefetchVoiceAroundTime = useCallback((time: number, opts?: { count?: number; signal?: AbortSignal }) => {
    if (subtitleBackendRef.current !== 'webaudio') return;
    const urls = getPrefetchSubtitleUrls(time, opts?.count ?? 6);
    if (urls.length <= 0) return;
    const parentSignal = opts?.signal;

    for (let k = 0; k < urls.length; k += 1) {
      if (parentSignal?.aborted) return;
      const url = urls[k];
      if (!url) continue;
      if (cacheGetVoice(url) || voiceInflightRef.current.has(url)) continue;

      const ctrl = new AbortController();
      let offAbort: (() => void) | null = null;
      if (parentSignal) {
        const onAbort = () => { try { ctrl.abort(ABORT_REASON); } catch { /* ignore */ } };
        parentSignal.addEventListener('abort', onAbort, { once: true });
        offAbort = () => parentSignal.removeEventListener('abort', onAbort);
      }

      void ensureVoiceBuffer(url, ctrl.signal)
        .catch(() => {
          // silent
        })
        .finally(() => {
          offAbort?.();
        });
    }
  }, [cacheGetVoice, ensureVoiceBuffer, getPrefetchSubtitleUrls]);

  const stopAllSubtitleAudio = useCallback(() => {
    audioRefArr.forEach((r) => {
      const a = r.current;
      if (!a) return;
      try {
        a.pause();
      } catch {
        // ignore
      }
      try {
        // Ensure a previously playing element doesn't resume from a stale offset.
        if (a.readyState >= 1) a.currentTime = 0;
      } catch {
        // ignore
      }
    });
  }, [audioRefArr]);

  const getMinStartBufferSeconds = useCallback(() => {
    return getAdaptiveBufferPolicy().startBufferSeconds;
  }, [getAdaptiveBufferPolicy]);

  const waitForVideoWarmup = useCallback(async (
    videoEl: HTMLVideoElement,
    gateToken: number,
    opts: { minBufferSeconds: number; timeoutMs: number }
  ) => {
    const startMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const timeoutMs = Math.max(0, opts.timeoutMs);

    // Ensure a load is in-flight; harmless if already loading.
    try {
      if (videoEl.readyState === 0) videoEl.load();
    } catch {
      // ignore
    }

    // 1) Wait for HAVE_METADATA (duration + seekability become reliable).
    while (videoEl.readyState < 1) {
      if (gateToken !== videoStartGateTokenRef.current) return false;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - startMs > timeoutMs) return false;
      await new Promise((r) => setTimeout(r, 80));
    }

    // 2) Wait for some buffered runway. This is a best-effort UX gate: with non-faststart MP4s,
    // buffering can be inherently slow; we time out and still attempt play().
    const minAhead = Math.max(0, opts.minBufferSeconds);
    if (minAhead <= 0) return true;

    while (true) {
      if (gateToken !== videoStartGateTokenRef.current) return false;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - startMs > timeoutMs) return false;

      // `readyState >= HAVE_FUTURE_DATA` implies at least some forward buffer.
      if (videoEl.readyState >= 3) return true;

      const ahead = getBufferedAheadSeconds(videoEl.buffered as any, videoEl.currentTime);
      if (ahead >= minAhead) return true;

      await new Promise((r) => setTimeout(r, 120));
    }
  }, []);

  const playVideoWithGate = useCallback(async (
    videoEl: HTMLVideoElement,
    opts: { reason: string }
  ) => {
    const src = videoEl.currentSrc || videoEl.src || '';
    if (!src) return false;

    const gateToken = ++videoStartGateTokenRef.current;
    transportIsStalledRef.current = false;
    setIsVideoBuffering(true);

    // Warm-up gate (metadata + min buffered runway).
    const minBufferSeconds = getMinStartBufferSeconds();
    await waitForVideoWarmup(videoEl, gateToken, { minBufferSeconds, timeoutMs: 12_000 });
    if (gateToken !== videoStartGateTokenRef.current) return false;

    const playToken = ++videoPlayTokenRef.current;
    try {
      await videoEl.play();
      if (playToken === videoPlayTokenRef.current) {
        setIsPlaying(true);
        return true;
      }
      return false;
    } catch (e) {
      if (playToken !== videoPlayTokenRef.current) return false;
      if (isAbortError(e)) return false;
      console.error('[Transport] video play failed:', opts.reason, e);
      const name = e && typeof e === 'object' && 'name' in e ? String((e as any).name) : '';
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as any).message || '') : '';
      if (name === 'NotSupportedError') {
        toast.error(t('videoEditor.toast.videoLoadFailed'));
      } else {
        toast.error(t('videoEditor.toast.playFailed', { error: msg || t('videoEditor.toast.unknownError') }));
      }
      setIsPlaying(false);
      setIsVideoBuffering(false);
      return false;
    }
  }, [getMinStartBufferSeconds, t, waitForVideoWarmup]);

  const beginSubtitleBuffering = useCallback(async (_reasonIndex: number, url: string) => {
    if (isSubtitleBuffering) return;
    setIsSubtitleBuffering(true);
    try { bufferingAbortRef.current?.abort(ABORT_REASON); } catch { /* ignore */ }
    const controller = new AbortController();
    bufferingAbortRef.current = controller;
    // Invalidate any pending video `play()` to avoid stale resolution flipping `isPlaying`.
    videoPlayTokenRef.current += 1;
    transportIsStalledRef.current = false;

    // Stop all audible outputs immediately to avoid "pointer moves but no voice".
    const videoEl = videoPreviewRef.current?.videoElement;
    if (!videoEl || !(videoEl.currentSrc || videoEl.src)) {
      setIsSubtitleBuffering(false);
      return;
    }

    try {
      videoEl.pause();
    } catch {
      // ignore
    }
    try {
      bgmAudioRef.current?.pause();
    } catch {
      // ignore
    }

    stopWebAudioVoice();
    stopAllSubtitleAudio();
    setIsPlaying(false);

    try {
      // Decode the blocking segment first.
      await ensureVoiceBuffer(url, controller.signal);
    } catch (e) {
      if (controller.signal.aborted) return;
      // WebAudio decode can fail due to missing CORS; fall back to media playback.
      console.error('[VoiceEngine] decode failed, falling back to <audio>:', e);
      subtitleBackendRef.current = 'media';
      setIsSubtitleBuffering(false);
      toast.error(locale === 'zh' ? '语音解码失败，已切换到兼容模式' : 'Voice decode failed, switched to compatibility mode');
      return;
    }

    if (controller.signal.aborted) return;
    // Resume transport. If autoplay policies block, users can hit Play again.
    setIsSubtitleBuffering(false);
    try {
      void voiceAudioCtxRef.current?.resume?.().catch(() => {
        // ignore
      });
      await playVideoWithGate(videoEl, { reason: 'subtitle-buffering-resume' });
    } catch (e) {
      if (isAbortError(e)) return;
      console.error('[VoiceEngine] resume failed:', e);
      toast.error(locale === 'zh' ? '点击播放继续' : 'Tap Play to continue');
    }
  }, [ensureVoiceBuffer, isSubtitleBuffering, locale, playVideoWithGate, stopAllSubtitleAudio, stopWebAudioVoice]);

  // Update Audio Playback based on current time
  const syncAudioPlayback = useCallback((time: number) => {
    if (isSubtitleMuted || isAudioRefArrPause.current || subtitleTrack.length === 0) return;
    if (transportIsStalledRef.current) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const startMargin = 0.1;
    // Binary search on startTime (subtitleTrack is chronological).
    let lo = 0;
    let hi = subtitleTrack.length - 1;
    let best = -1;
    // Use the actual time for lookup; `startMargin` is only used for the in-window check.
    // This avoids switching to the next segment early when two windows overlap by margin.
    const target = time;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (subtitleTrack[mid].startTime <= target) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    const currentSubtitleIndex = (() => {
      if (best < 0) return -1;
      const sub = subtitleTrack[best];
      const end = sub.startTime + sub.duration;
      return time >= sub.startTime - startMargin && time < end ? best : -1;
    })();

    // If we *should* be playing a segment but the audio isn't moving, kick a re-sync.
    if (currentSubtitleIndex !== -1 && currentSubtitleIndex === lastPlayedSubtitleIndexRef.current) {
      // Give the browser/network time to start audio after a seek/resume. Without this,
      // we can thrash (pause/restart) and end up "looping" the first word/phrase.
      if (now < subtitleGraceUntilMsRef.current) return;

      const kick = subtitleKickRef.current;
      if (kick && kick.index === currentSubtitleIndex && now - kick.atMs < 900) return;

      if (now - subtitleWatchdogMsRef.current >= 240) {
        subtitleWatchdogMsRef.current = now;
        const sub = subtitleTrack[currentSubtitleIndex];
        const a = audioRefArr[currentSubtitleIndex % 5]?.current;
        if (sub?.audioUrl && a) {
          const offset = Math.max(0, time - sub.startTime);
          const drift = (() => {
            try {
              return Math.abs(a.currentTime - offset);
            } catch {
              return 0;
            }
          })();
          const isError =
            Boolean(a.error) ||
            a.networkState === 0 || // NETWORK_EMPTY
            a.networkState === 3; // NETWORK_NO_SOURCE

          // IMPORTANT: do NOT treat `ended` as a failure. Some clips are shorter than
          // their time window; replaying them causes "repeating the same sentence".
          const isStalled = a.paused && !a.ended;

          // If the audio element is stalled (paused but not ended) for too long, re-enter
          // the start path (reload + play). Keep this conservative to avoid stutter loops.
          if (isError) {
            subtitleRetryRef.current = { index: currentSubtitleIndex, untilMs: now + 260 };
            lastPlayedSubtitleIndexRef.current = -1;
            return;
          }

          if (isStalled) {
            // Try a cheap "resume" first (no reload).
            if (!kick || now - kick.atMs >= 1200) {
              const playToken = ++subtitlePlayTokenRef.current;
              a.play().catch((e) => {
                if (playToken !== subtitlePlayTokenRef.current) return;
                if (isAbortError(e)) return;
                // Fall back to restart path after a short delay.
                subtitleRetryRef.current = { index: currentSubtitleIndex, untilMs: now + 280 };
                lastPlayedSubtitleIndexRef.current = -1;
              });
              subtitleKickRef.current = { index: currentSubtitleIndex, atMs: now };
            }
            return;
          }

          // Soft re-sync: if we're clearly off, seek the audio forward instead of restarting
          // (restarting is what makes the first segment feel "stuttery").
          if (!a.ended && !a.paused && drift > 0.95) {
            try {
              if (a.readyState >= 1) a.currentTime = offset;
            } catch {
              // ignore
            }
            subtitleKickRef.current = { index: currentSubtitleIndex, atMs: now };
          }
        }
      }
    }

    if (currentSubtitleIndex !== -1 && currentSubtitleIndex !== lastPlayedSubtitleIndexRef.current) {
      const retry = subtitleRetryRef.current;
      if (retry && retry.index === currentSubtitleIndex && now < retry.untilMs) {
        // Defer the retry a tiny bit so the browser has time to buffer/decode.
        lastPlayedSubtitleIndexRef.current = -1;
        setPlayingSubtitleIndex(currentSubtitleIndex);
        return;
      }
      subtitleRetryRef.current = null;

      // Prevent overlap when the user jumps quickly between segments (or when clips overrun their window).
      stopAllSubtitleAudio();

      setPlayingSubtitleIndex(currentSubtitleIndex);

      const sub = subtitleTrack[currentSubtitleIndex];
      const offset = Math.max(0, time - sub.startTime);

      // Round-robin audio players
      const audioRef = audioRefArr[currentSubtitleIndex % 5];

      if (sub?.audioUrl && audioRef.current) {
        lastPlayedSubtitleIndexRef.current = currentSubtitleIndex;
        subtitleKickRef.current = { index: currentSubtitleIndex, atMs: now };
        const playToken = ++subtitlePlayTokenRef.current;
        const a = audioRef.current;

        const needsReload =
          a.src !== sub.audioUrl ||
          Boolean(a.error) ||
          a.networkState === 0 || // NETWORK_EMPTY
          a.networkState === 3; // NETWORK_NO_SOURCE

        if (needsReload) {
          a.preload = 'auto';
          a.src = sub.audioUrl;
          try {
            a.load();
          } catch {
            // ignore
          }
        } else if (a.readyState === 0) {
          // Same src but nothing loaded yet (or prior load failed silently). Kick `load()` once.
          try {
            a.load();
          } catch {
            // ignore
          }
        }

        try {
          if (a.readyState >= 1) a.currentTime = offset;
        } catch {
          // ignore; some browsers throw while metadata is not ready
        }
        a.volume = volume / 100;
        a.play().catch((e) => {
          // AbortError is expected when we pause/switch quickly; treat it as non-fatal.
          if (playToken !== subtitlePlayTokenRef.current) return;
          if (isAbortError(e)) {
            subtitleRetryRef.current = { index: currentSubtitleIndex, untilMs: now + 160 };
            lastPlayedSubtitleIndexRef.current = -1;
            return;
          }
          console.error('Subtitle audio play failed', e);
          subtitleRetryRef.current = { index: currentSubtitleIndex, untilMs: now + 420 };
          lastPlayedSubtitleIndexRef.current = -1;
        });
      }

      // Preload a short lookahead window; low-end devices use fewer slots.
      const lookaheadCount = Math.max(1, Math.min(4, getAdaptivePrefetchCount('lookahead')));
      for (let k = 1; k <= lookaheadCount; k++) {
        const next = subtitleTrack[currentSubtitleIndex + k];
        if (!next?.audioUrl) continue;
        const ref = audioRefArr[(currentSubtitleIndex + k) % 5];
        const a = ref?.current;
        if (!a) continue;
        const needsReload =
          a.src !== next.audioUrl ||
          Boolean(a.error) ||
          a.networkState === 0 ||
          a.networkState === 3;
        if (!needsReload) continue;
        a.preload = 'auto';
        a.src = next.audioUrl;
        try {
          a.load();
        } catch {
          // ignore
        }
      }
    } else if (currentSubtitleIndex === -1 && lastPlayedSubtitleIndexRef.current !== -1) {
      lastPlayedSubtitleIndexRef.current = -1;
      setPlayingSubtitleIndex(-1);
      stopAllSubtitleAudio();
      // Stop current audio? Logic from old: just let it finish or pause?
      // Typically we let it finish if it's strictly segmented, but here we pause just in case
      // audioRefArr.forEach(r => r.current?.pause());
    }
  }, [audioRefArr, getAdaptivePrefetchCount, isSubtitleMuted, stopAllSubtitleAudio, subtitleTrack, volume]);

  const syncVoicePlaybackWebAudio = useCallback((time: number) => {
    if (subtitleBackendRef.current !== 'webaudio') return;
    if (isSubtitleBuffering) return;
    if (transportIsStalledRef.current) return;
    const msNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (msNow - lastVoiceSyncMsRef.current < 70) return;
    lastVoiceSyncMsRef.current = msNow;
    if (isSubtitleMutedRef.current) {
      if (lastVoiceSubtitleIndexRef.current !== -1) {
        lastVoiceSubtitleIndexRef.current = -1;
        // 试听模式下（字幕静音由试听流程临时设置），保留工作台/画面的选中高亮
        if (auditionStopAtMsRef.current == null) setPlayingSubtitleIndex(-1);
      }
      stopWebAudioVoice();
      return;
    }

    const track = subtitleTrackRef.current;
    if (!track.length) {
      if (lastVoiceSubtitleIndexRef.current !== -1) {
        lastVoiceSubtitleIndexRef.current = -1;
        setPlayingSubtitleIndex(-1);
      }
      stopWebAudioVoice();
      return;
    }

    const idx = findSubtitleIndexAtTime(track, time);
    if (idx !== lastVoiceSubtitleIndexRef.current) {
      lastVoiceSubtitleIndexRef.current = idx;
      setPlayingSubtitleIndex(idx);
    }
    if (idx === -1) {
      // Transport is currently in a gap: enforce silence now, but keep any scheduled "next"
      // so the upcoming segment can start sample-accurately without reschedule churn.
      stopWebAudioVoiceCurrent();

      const upcomingIdx = findNextSubtitleIndexAtOrAfterTime(track, time);
      if (upcomingIdx === -1) {
        // End of track: clear any stale scheduled "next".
        if (voiceNextRef.current) {
          try {
            voiceNextRef.current.source.onended = null;
          } catch {
            // ignore
          }
          try {
            voiceNextRef.current.source.stop(0);
          } catch {
            // ignore
          }
          try {
            voiceNextRef.current.source.disconnect();
          } catch {
            // ignore
          }
        }
        voiceNextRef.current = null;
        return;
      }

      const upcoming = track[upcomingIdx];
      const upcomingUrl = (upcoming?.audioUrl || '').trim();
      if (!upcomingUrl || upcoming.duration <= 0) return;

      // Decode ahead (do not block).
      if (!cacheGetVoice(upcomingUrl) && !voiceInflightRef.current.has(upcomingUrl)) {
        const ctrl = new AbortController();
        void ensureVoiceBuffer(upcomingUrl, ctrl.signal).catch(() => {
          // silent
        });
      }

      const nextBuf = cacheGetVoice(upcomingUrl);
      if (!nextBuf) return;

      let ctx: AudioContext;
      try {
        ctx = getOrCreateVoiceAudioCtx();
      } catch (e) {
        console.error('[VoiceEngine] WebAudio unavailable, falling back to <audio>:', e);
        subtitleBackendRef.current = 'media';
        return;
      }
      const gain = voiceGainRef.current;
      if (!gain) return;

      const now = ctx.currentTime;
      const when = now + Math.max(0, upcoming.startTime - time);
      const lookahead = 3.0;
      if (when > now + lookahead) return;

      const scheduled = voiceNextRef.current;
      if (scheduled && scheduled.index === upcomingIdx && scheduled.url === upcomingUrl && Math.abs(scheduled.startAt - when) <= 0.06) {
        return;
      }

      // Replace any previously scheduled "next".
      if (voiceNextRef.current) {
        try {
          voiceNextRef.current.source.onended = null;
        } catch {
          // ignore
        }
        try {
          voiceNextRef.current.source.stop(0);
        } catch {
          // ignore
        }
        try {
          voiceNextRef.current.source.disconnect();
        } catch {
          // ignore
        }
        voiceNextRef.current = null;
      }

      try {
        const src = ctx.createBufferSource();
        src.buffer = nextBuf;
        src.connect(gain);
        const playDur = Math.min(upcoming.duration, nextBuf.duration);
        if (playDur <= 0.02) return;
        src.start(when, 0, playDur);
        const stopAt = when + playDur;
        try {
          src.stop(stopAt + 0.01);
        } catch {
          // ignore
        }
        voiceNextRef.current = { index: upcomingIdx, url: upcomingUrl, source: src, startAt: when, stopAt, epoch: voiceEpochRef.current };
        src.onended = () => {
          const n2 = voiceNextRef.current;
          if (n2 && n2.source === src) voiceNextRef.current = null;
        };
      } catch (e) {
        console.error('[VoiceEngine] schedule next failed:', e);
      }

      return;
    }

    const sub = track[idx];
    const url = (sub?.audioUrl || '').trim();
    if (!url || sub.duration <= 0) {
      stopWebAudioVoiceCurrent();
      return;
    }

    const cached = cacheGetVoice(url);
    if (!cached) {
      void beginSubtitleBuffering(idx, url);
      return;
    }

    let ctx: AudioContext;
    try {
      ctx = getOrCreateVoiceAudioCtx();
    } catch (e) {
      console.error('[VoiceEngine] WebAudio unavailable, falling back to <audio>:', e);
      subtitleBackendRef.current = 'media';
      return;
    }

    const gain = voiceGainRef.current;
    if (!gain) return;

    // Current segment: start once when entering the segment; schedule slightly ahead to survive jank.
    const now = ctx.currentTime;
    const lead = 0.04;
    const desiredVideoAtStart = time + lead;
    const offset = Math.max(0, desiredVideoAtStart - sub.startTime);
    const maxPlayable = Math.min(sub.duration, cached.duration);
    const dur = Math.max(0, maxPlayable - offset);

    // If the segment is already pre-scheduled as "next" (common at boundaries),
    // promote it to "current" to avoid stop→restart stutter and tail repeats.
    const cur0 = voiceCurrentRef.current;
    const scheduledCur = voiceNextRef.current;
    if ((!cur0 || cur0.index !== idx || cur0.url !== url) && scheduledCur && scheduledCur.index === idx && scheduledCur.url === url) {
      if (cur0 && (cur0.index !== idx || cur0.url !== url)) {
        try {
          cur0.source.onended = null;
        } catch {
          // ignore
        }
        try {
          cur0.source.stop(0);
        } catch {
          // ignore
        }
        try {
          cur0.source.disconnect();
        } catch {
          // ignore
        }
      }
      voiceNextRef.current = null;
      voiceCurrentRef.current = { index: idx, url, source: scheduledCur.source, stopAt: scheduledCur.stopAt, epoch: scheduledCur.epoch };
      // Do not clear `voiceCurrentRef` on end. Clearing it makes the scheduler "restart"
      // the last syllable/word when <video> time stalls near the boundary.
      try {
        scheduledCur.source.onended = () => {
          try {
            scheduledCur.source.disconnect();
          } catch {
            // ignore
          }
        };
      } catch {
        // ignore
      }
    }

    const cur = voiceCurrentRef.current;
    if (!cur || cur.index !== idx || cur.url !== url) {
      // Avoid restarting tiny tails (it sounds like the last syllable/word "stutters").
      // Keep the rest of the loop running so we can still schedule the next segment.
      const tailGuard = Math.max(0.08, Math.min(0.12, maxPlayable * 0.25));
      stopWebAudioVoice();
      if (dur <= tailGuard) {
        // Too close to the end; leave silent and let the next segment take over.
      } else {
        try {
          const source = ctx.createBufferSource();
          source.buffer = cached;
          source.connect(gain);
          const startAt = now + lead;
          source.start(startAt, offset, dur);
          const stopAt = startAt + dur;
          // Give a tiny tail so `onended` is reliable.
          try {
            source.stop(stopAt + 0.01);
          } catch {
            // ignore
          }
          voiceCurrentRef.current = { index: idx, url, source, stopAt, epoch: voiceEpochRef.current };
          // Keep `voiceCurrentRef` until we leave the segment. See note above.
          source.onended = () => {
            try {
              source.disconnect();
            } catch {
              // ignore
            }
          };
        } catch (e) {
          console.error('[VoiceEngine] start failed:', e);
        }
      }

    }

    // Next segment: pre-schedule to avoid gaps when the main thread hiccups.
    const next = track[idx + 1];
    if (!next?.audioUrl || next.duration <= 0) {
      if (voiceNextRef.current) {
        try {
          voiceNextRef.current.source.onended = null;
        } catch {
          // ignore
        }
        try {
          voiceNextRef.current.source.stop(0);
        } catch {
          // ignore
        }
        try {
          voiceNextRef.current.source.disconnect();
        } catch {
          // ignore
        }
      }
      voiceNextRef.current = null;
      return;
    }

    const nextUrl = next.audioUrl.trim();
    if (!nextUrl) return;

    // Start decoding the next clips early (do not block).
    const decodeLookaheadCount = Math.max(1, Math.min(3, getAdaptiveWebAudioDecodeLookaheadCount()));
    for (let k = 1; k <= decodeLookaheadCount; k += 1) {
      const seg = track[idx + k];
      const u = (seg?.audioUrl || '').trim();
      if (!u) continue;
      if (cacheGetVoice(u) || voiceInflightRef.current.has(u)) continue;
      const ctrl = new AbortController();
      void ensureVoiceBuffer(u, ctrl.signal).catch(() => {
        // silent
      });
    }

    const nextBuf = cacheGetVoice(nextUrl);
    if (!nextBuf) return;

    const when = now + Math.max(0, next.startTime - time);
    const lookahead = 3.0;
    if (when > now + lookahead) return;

    const scheduled = voiceNextRef.current;
    if (scheduled && scheduled.index === idx + 1 && scheduled.url === nextUrl && Math.abs(scheduled.startAt - when) <= 0.06) {
      return;
    }

    // Replace any previously scheduled "next".
    if (voiceNextRef.current) {
      try {
        voiceNextRef.current.source.onended = null;
      } catch {
        // ignore
      }
      try {
        voiceNextRef.current.source.stop(0);
      } catch {
        // ignore
      }
      try {
        voiceNextRef.current.source.disconnect();
      } catch {
        // ignore
      }
      voiceNextRef.current = null;
    }

    try {
      const src = ctx.createBufferSource();
      src.buffer = nextBuf;
      src.connect(gain);
      const playDur = Math.min(next.duration, nextBuf.duration);
      if (playDur <= 0.02) return;
      src.start(when, 0, playDur);
      const stopAt = when + playDur;
      try {
        src.stop(stopAt + 0.01);
      } catch {
        // ignore
      }
      voiceNextRef.current = { index: idx + 1, url: nextUrl, source: src, startAt: when, stopAt, epoch: voiceEpochRef.current };
      src.onended = () => {
        const n2 = voiceNextRef.current;
        if (n2 && n2.source === src) voiceNextRef.current = null;
      };
    } catch (e) {
      console.error('[VoiceEngine] schedule next failed:', e);
    }
  }, [
    beginSubtitleBuffering,
    cacheGetVoice,
    ensureVoiceBuffer,
    findNextSubtitleIndexAtOrAfterTime,
    findSubtitleIndexAtTime,
    getOrCreateVoiceAudioCtx,
    getAdaptiveWebAudioDecodeLookaheadCount,
    isSubtitleBuffering,
    stopWebAudioVoice,
    stopWebAudioVoiceCurrent,
  ]);

  const updateTimeLoop = useCallback(() => {
    // Clear the scheduled handle that's calling us.
    rafIdRef.current = null;
    videoFrameCbIdRef.current = null;

    const videoEl = videoPreviewRef.current?.videoElement as any;
    if (!videoEl) return;

    // Single transport truth: if the user isn't "playing", do not keep scheduling.
    if (!isPlayingRef.current) return;
    // During buffering, we rely on <video> events (waiting/playing) to resume the loop.
    if (transportIsStalledRef.current || isSubtitleBufferingRef.current) return;
    if (videoEl.paused) return;

    const time = videoEl.currentTime;
    // 字幕工作台试听：到点自动停住视频画面
    const auditionStopAtMs = auditionStopAtMsRef.current;
    if (auditionStopAtMs != null) {
      const timeMs = time * 1000;
      const isSourceMode = auditionActiveTypeRef.current === 'source';
      const srcAudio = sourceAuditionAudioRef.current;
      const sourceStillPlaying = isSourceMode && srcAudio && !srcAudio.paused && !srcAudio.ended;
      const graceExceeded = timeMs >= auditionStopAtMs + 3000;
      if (Number.isFinite(timeMs) && timeMs >= auditionStopAtMs + 50 && (!sourceStillPlaying || graceExceeded)) {
        // Cancel any in-flight warmup/play so it can't flip state later.
        videoStartGateTokenRef.current += 1;
        videoPlayTokenRef.current += 1;
        transportIsStalledRef.current = false;
        setIsVideoBuffering(false);
        try {
          videoEl.pause();
        } catch {
          // ignore
        }
        // Also stop source audition audio immediately.
        try {
          if (sourceAuditionAudioRef.current) {
            sourceAuditionAudioRef.current.onended = null;
            sourceAuditionAudioRef.current.onerror = null;
            sourceAuditionAudioRef.current.ontimeupdate = null;
            sourceAuditionAudioRef.current.pause();
          }
        } catch { /* ignore */ }
        setIsPlaying(false);

        // Dispatch synthetic event to handleAuditionStop cleanly without async deps cycles
        window.setTimeout(() => {
          document.dispatchEvent(new CustomEvent('revoice-audition-natural-stop'));
        }, 10);
        return;
      }
    }

    // UI does not need perfect granularity; keep React renders bounded.
    if (Math.abs(time - lastUiTimeRef.current) >= 1 / 20) {
      lastUiTimeRef.current = time;
      setCurrentTime(time);
    }

    if (subtitleBackendRef.current === 'webaudio') syncVoicePlaybackWebAudio(time);
    else syncAudioPlayback(time);

    // Drive playback sync from video frames when available. This avoids RAF churn
    // and eliminates "time stalled but loop still running" races.
    const requestVfc = videoEl.requestVideoFrameCallback;
    if (typeof requestVfc === 'function') {
      videoFrameCbIdRef.current = requestVfc.call(videoEl, () => updateTimeLoop());
    } else {
      rafIdRef.current = requestAnimationFrame(updateTimeLoop);
    }
  }, [syncAudioPlayback, syncVoicePlaybackWebAudio]);

  const startUpdateLoop = useCallback(() => {
    cancelUpdateLoop();
    const videoEl = videoPreviewRef.current?.videoElement as any;
    if (!videoEl) return;
    if (!isPlayingRef.current) return;
    if (transportIsStalledRef.current || isSubtitleBufferingRef.current) return;
    if (videoEl.paused) return;

    const requestVfc = videoEl.requestVideoFrameCallback;
    if (typeof requestVfc === 'function') {
      videoFrameCbIdRef.current = requestVfc.call(videoEl, () => updateTimeLoop());
    } else {
      rafIdRef.current = requestAnimationFrame(updateTimeLoop);
    }
  }, [cancelUpdateLoop, updateTimeLoop]);

  // Freeze/resume audio transport based on real <video> buffering signals.
  // This is the pro-editor behavior: video is the master clock; audio follows it.
  useEffect(() => {
    const videoEl = videoPreviewRef.current?.videoElement as any;
    if (!videoEl) return;

    const clearStallTimer = () => {
      const id = transportStallTimerRef.current;
      if (id == null) return;
      transportStallTimerRef.current = null;
      try {
        window.clearTimeout(id);
      } catch {
        // ignore
      }
    };

    const suspendVoice = () => {
      if (subtitleBackendRef.current !== 'webaudio') return;
      const ctx = voiceAudioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === 'running') {
        void ctx.suspend().catch(() => {
          // ignore
        });
      }
    };

    const resumeVoice = () => {
      if (subtitleBackendRef.current !== 'webaudio') return;
      const ctx = voiceAudioCtxRef.current;
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {
          // ignore
        });
      }
    };

    const onBufferStart = () => {
      // Ignore explicit pauses; buffering only matters while video is attempting to play.
      if (videoEl.paused) return;
      if (isSubtitleBufferingRef.current) return;
      if (transportIsStalledRef.current) return;
      if (transportStallTimerRef.current != null) return;

      // Debounce: many browsers emit short "waiting" blips during startup or minor decode hiccups.
      // Treat it as a stall only if it persists for a moment; this prevents pause/resume thrash.
      transportStallTimerRef.current = window.setTimeout(() => {
        transportStallTimerRef.current = null;
        if (videoEl.paused) return;
        if (isSubtitleBufferingRef.current) return;
        if (transportIsStalledRef.current) return;

        transportIsStalledRef.current = true;
        setIsVideoBuffering(true);
        cancelUpdateLoop();

        try {
          bgmAudioRef.current?.pause();
        } catch {
          // ignore
        }
        // Media backend needs explicit pausing to stay in sync.
        if (subtitleBackendRef.current === 'media') {
          audioRefArr.forEach((r) => {
            try {
              r.current?.pause();
            } catch {
              // ignore
            }
          });
        }
        suspendVoice();
      }, 180);
    };

    const onBufferEnd = () => {
      clearStallTimer();
      if (isSubtitleBufferingRef.current) return;

      transportIsStalledRef.current = false;
      setIsVideoBuffering(false);
      if (videoEl.paused) return;
      resumeVoice();
      // Force a quick BGM kick on resume.
      bgmKickMsRef.current = 0;
      startUpdateLoop();
    };

    const onPauseLike = () => {
      clearStallTimer();
      transportIsStalledRef.current = false;
      setIsVideoBuffering(false);
      cancelUpdateLoop();
    };

    videoEl.addEventListener('waiting', onBufferStart);
    videoEl.addEventListener('stalled', onBufferStart);
    videoEl.addEventListener('playing', onBufferEnd);
    videoEl.addEventListener('canplay', onBufferEnd);
    videoEl.addEventListener('pause', onPauseLike);
    videoEl.addEventListener('ended', onPauseLike);

    return () => {
      clearStallTimer();
      videoEl.removeEventListener('waiting', onBufferStart);
      videoEl.removeEventListener('stalled', onBufferStart);
      videoEl.removeEventListener('playing', onBufferEnd);
      videoEl.removeEventListener('canplay', onBufferEnd);
      videoEl.removeEventListener('pause', onPauseLike);
      videoEl.removeEventListener('ended', onPauseLike);
    };
  }, [audioRefArr, cancelUpdateLoop, startUpdateLoop, videoTrack[0]?.url]);

  // When resuming playback from a paused state, force subtitle audio to re-sync.
  // Otherwise the current subtitle segment can remain silent until the next segment.
  useEffect(() => {
    if (!isPlaying) return;
    lastPlayedSubtitleIndexRef.current = -1;
    // A cancelled/unfinished drag can leave this stuck `true`, which would mute all subtitle audio.
    isAudioRefArrPause.current = false;
  }, [audioRefArr, isPlaying, subtitleTrack, t]);

  useEffect(() => {
    const videoEl = videoPreviewRef.current?.videoElement;
    if (!videoEl) return;

    if (isPlaying) {
      if (subtitleBackendRef.current === 'webaudio') {
        // Keep WebAudio unlocked once the user has started playback.
        void voiceAudioCtxRef.current?.resume?.().catch(() => {
          // ignore
        });
      }
      return;
    }

    // Stopping playback: cancel the transport loop and silence all outputs.
    cancelUpdateLoop();
    transportIsStalledRef.current = false;
    setIsVideoBuffering(false);
    bgmAudioRef.current?.pause();
    audioRefArr.forEach((r) => r.current?.pause());
    stopWebAudioVoice();
  }, [audioRefArr, cancelUpdateLoop, isPlaying, stopWebAudioVoice]);

  useEffect(() => {
    if (isPlaying || isSubtitleBuffering || seekDragActiveRef.current) {
      try { pausePrefetchAbortRef.current?.abort(ABORT_REASON); } catch { /* ignore */ }
      pausePrefetchAbortRef.current = null;
      return;
    }

    const videoEl = videoPreviewRef.current?.videoElement;
    if (!videoEl || !(videoEl.currentSrc || videoEl.src)) return;

    const anchor = Number.isFinite(videoEl.currentTime) ? (videoEl.currentTime || 0) : currentTime;
    if (subtitleBackendRef.current === 'webaudio') {
      const ctrl = new AbortController();
      try { pausePrefetchAbortRef.current?.abort(ABORT_REASON); } catch { /* ignore */ }
      pausePrefetchAbortRef.current = ctrl;

      prefetchVoiceAroundTime(anchor, { count: getAdaptivePrefetchCount('pause'), signal: ctrl.signal });

      return () => {
        try { ctrl.abort(ABORT_REASON); } catch { /* ignore */ }
        if (pausePrefetchAbortRef.current === ctrl) {
          pausePrefetchAbortRef.current = null;
        }
      };
    }

    try { pausePrefetchAbortRef.current?.abort(ABORT_REASON); } catch { /* ignore */ }
    pausePrefetchAbortRef.current = null;
    if (subtitleBackendRef.current !== 'media') return;

    // Media fallback backend: preload upcoming subtitle clips while paused.
    const preloadCount = Math.max(1, Math.min(audioRefArr.length, getAdaptivePrefetchCount('pause')));
    const urls = getPrefetchSubtitleUrls(anchor, preloadCount);
    for (let i = 0; i < preloadCount; i += 1) {
      const url = urls[i];
      if (!url) break;
      const a = audioRefArr[i]?.current;
      if (!a) continue;
      const needsReload =
        a.src !== url ||
        Boolean(a.error) ||
        a.networkState === 0 || // NETWORK_EMPTY
        a.networkState === 3; // NETWORK_NO_SOURCE
      if (!needsReload) continue;
      a.preload = 'auto';
      a.src = url;
      try {
        a.load();
      } catch {
        // ignore
      }
    }
  }, [audioRefArr, currentTime, getAdaptivePrefetchCount, getPrefetchSubtitleUrls, isPlaying, isSubtitleBuffering, prefetchVoiceAroundTime, subtitleTrack]);

  useEffect(() => {
    if (!isPlaying) return;
    startUpdateLoop();
  }, [isPlaying, startUpdateLoop]);

  // Keep BGM aligned with the video transport. Throttle to avoid hammering `play()`.
  useEffect(() => {
    const bgm = bgmAudioRef.current;
    if (!bgm) return;
    const videoEl = videoPreviewRef.current?.videoElement;
    if (
      !isPlaying ||
      !videoEl ||
      videoEl.paused ||
      isBgmMuted ||
      isSubtitleBuffering ||
      isVideoBuffering ||
      transportIsStalledRef.current
    ) {
      try {
        bgm.pause();
      } catch {
        // ignore
      }
      return;
    }
    if (bgmTrack.length <= 0) return;

    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now - bgmKickMsRef.current < 220) return;
    bgmKickMsRef.current = now;

    const transportTime = Number.isFinite(videoEl.currentTime) ? (videoEl.currentTime || 0) : currentTime;
    try {
      if (Math.abs(bgm.currentTime - transportTime) > 0.45) {
        bgm.currentTime = transportTime;
      }
    } catch {
      // ignore
    }
    bgm.volume = volume / 100;
    if (bgm.paused) {
      bgm.play().catch((e) => {
        if (isAbortError(e)) return;
        console.error('BGM play failed', e);
      });
    }
  }, [bgmTrack, currentTime, isBgmMuted, isPlaying, isSubtitleBuffering, isVideoBuffering, volume]);

  // If user mutes subtitle audio, stop any currently-playing subtitle segments immediately.
  useEffect(() => {
    if (!isSubtitleMuted) return;
    audioRefArr.forEach((r) => r.current?.pause());
    stopWebAudioVoice();
  }, [audioRefArr, isSubtitleMuted, stopWebAudioVoice]);

  // If the user unmutes while playing, force a resync so the current segment can re-enter `play()`.
  useEffect(() => {
    if (!isPlaying) return;
    if (isSubtitleMuted) return;
    lastPlayedSubtitleIndexRef.current = -1;
    lastVoiceSubtitleIndexRef.current = -1;
    stopWebAudioVoice();
  }, [isPlaying, isSubtitleMuted, stopWebAudioVoice]);

  // --- ACTIONS ---

  const handlePlayPause = useCallback(() => {
    auditionTokenRef.current += 1;
    const videoEl = videoPreviewRef.current?.videoElement;
    if (isSubtitleBuffering) {
      try { bufferingAbortRef.current?.abort(ABORT_REASON); } catch { /* ignore */ }
      bufferingAbortRef.current = null;
      setIsSubtitleBuffering(false);
      // Cancel any in-flight play() promise handling.
      videoPlayTokenRef.current += 1;
      transportIsStalledRef.current = false;
      return;
    }
    // Allow a second click to cancel the "buffer-before-play" warmup gate.
    if (!isPlaying && isVideoBuffering) {
      videoStartGateTokenRef.current += 1;
      videoPlayTokenRef.current += 1;
      transportIsStalledRef.current = false;
      setIsVideoBuffering(false);
      return;
    }
    if (isPlaying) {
      try {
        videoEl?.pause();
      } catch {
        // ignore
      }
      // If in audition, do a full audition cleanup so the next play starts fresh.
      if (auditionActiveTypeRef.current) {
        try {
          if (sourceAuditionAudioRef.current) {
            sourceAuditionAudioRef.current.onended = null;
            sourceAuditionAudioRef.current.onerror = null;
            sourceAuditionAudioRef.current.ontimeupdate = null;
            sourceAuditionAudioRef.current.pause();
          }
        } catch { /* ignore */ }
        auditionStopAtMsRef.current = null;
        setPlayingSubtitleIndex(-1);
        playingSubtitleIndexRef.current = -1;
        setAuditionActiveType(null);
        auditionActiveTypeRef.current = null;
        if (auditionRestoreRef.current) {
          const { subtitleMuted, bgmMuted, videoMuted } = auditionRestoreRef.current;
          setIsSubtitleMuted(subtitleMuted);
          isSubtitleMutedRef.current = subtitleMuted;
          setIsBgmMuted(bgmMuted);
          isBgmMutedRef.current = bgmMuted;
          if (videoEl) videoEl.muted = videoMuted;
          auditionRestoreRef.current = null;
        }
      }
      // Cancel any in-flight play() promise handling.
      videoPlayTokenRef.current += 1;
      transportIsStalledRef.current = false;
      setIsPlaying(false);
      return;
    }

    // Start playback from a user gesture so browsers don't block `video.play()`.
    lastPlayedSubtitleIndexRef.current = -1;
    lastVoiceSubtitleIndexRef.current = -1;
    isAudioRefArrPause.current = false;
    stopWebAudioVoice();
    abortAllVoiceInflight();

    if (subtitleBackendRef.current === 'webaudio') {
      try {
        const ctx = getOrCreateVoiceAudioCtx();
        // Unlock AudioContext inside the user gesture.
        void ctx.resume().catch(() => {
          // ignore
        });
      } catch (e) {
        console.error('[VoiceEngine] init failed, falling back to <audio>:', e);
        subtitleBackendRef.current = 'media';
      }

      try {
        const t0 = Number.isFinite(videoEl?.currentTime) ? (videoEl?.currentTime || 0) : 0;
        const track = subtitleTrackRef.current;
        // If playback starts inside a subtitle segment, make that segment a hard requirement:
        // block transport until it is decoded, otherwise the user experiences "playhead moves but no voice".
        const idx = findSubtitleIndexAtTime(track, t0);
        if (idx !== -1) {
          const seg = track[idx];
          const url = (seg?.audioUrl || '').trim();
          if (url && !cacheGetVoice(url)) {
            void beginSubtitleBuffering(idx, url);
            return;
          }
        }

        // Prefetch a small window so segment boundaries don't stutter.
        prefetchVoiceAroundTime(t0, { count: getAdaptivePrefetchCount('play') });
      } catch {
        // ignore
      }
    }
    if (!videoEl || !(videoEl.currentSrc || videoEl.src)) {
      toast.error(t('videoEditor.toast.addVideoFirst'));
      setIsPlaying(false);
      return;
    }
    transportIsStalledRef.current = false;
    void playVideoWithGate(videoEl, { reason: 'user-play' });
  }, [
    abortAllVoiceInflight,
    beginSubtitleBuffering,
    cacheGetVoice,
    findSubtitleIndexAtTime,
    getAdaptivePrefetchCount,
    getOrCreateVoiceAudioCtx,
    isPlaying,
    isVideoBuffering,
    isSubtitleBuffering,
    prefetchVoiceAroundTime,
    playVideoWithGate,
    stopWebAudioVoice,
    t,
  ]);

  useEffect(() => {
    const suppressAbort = (e: PromiseRejectionEvent) => {
      if (isAbortError(e.reason)) e.preventDefault();
    };
    const suppressAbortSync = (e: ErrorEvent) => {
      if (isAbortError(e.error)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('unhandledrejection', suppressAbort);
    window.addEventListener('error', suppressAbortSync, true);
    return () => {
      window.removeEventListener('unhandledrejection', suppressAbort);
      window.removeEventListener('error', suppressAbortSync, true);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPause();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause]);

  const persistPendingTimingsIfNeeded = useCallback(async () => {
    if (pendingTimingCount === 0) return true;

    const items = Object.entries(pendingTimingMap).map(([id, v]) => ({
      id,
      startMs: v.startMs,
      endMs: v.endMs,
    }));
    const resp = await fetch('/api/video-task/update-subtitle-timings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ taskId: convertId, stepName: 'translate_srt', items }),
    });
    const back = await resp.json().catch(() => null);
    if (!resp.ok || back?.code !== 0) {
      toast.error(back?.message || back?.msg || (locale === 'zh' ? '保存时间轴失败' : 'Failed to save timeline'));
      return false;
    }

    const idMap = (back?.data?.idMap ?? {}) as Record<string, string>;
    const touchedIds = new Set(items.map((it) => it.id));
    const savedAtMs = Date.now();
    setConvertObj((prevObj) => {
      if (!prevObj) return prevObj;
      const arr = (prevObj.srt_convert_arr || []) as any[];
      const nextArr = arr.map((row) => {
        const id = row?.id;
        if (typeof id !== 'string') return row;
        const mapped = idMap?.[id];
        const nextId = typeof mapped === 'string' && mapped.length > 0 ? mapped : id;
        const shouldMark = touchedIds.has(id);
        if (nextId === id && !shouldMark) return row;
        const out = { ...row };
        if (nextId !== id) out.id = nextId;
        if (shouldMark) out.timing_rev_ms = savedAtMs;
        return out;
      });
      return { ...prevObj, srt_convert_arr: nextArr };
    });
    setPendingTimingMap({});
    return true;
  }, [convertId, locale, pendingTimingCount, pendingTimingMap]);

  const handleGenerateVideo = useCallback(async () => {
    if (isGeneratingVideo) return;
    if (explicitMissingVoiceIdSet.size > 0) {
      toast.error(t('videoEditor.toast.splitMissingVoice'));
      return;
    }
    setIsGeneratingVideo(true);
    try {
      const okTiming = await persistPendingTimingsIfNeeded();
      if (!okTiming) return;

      const ok = await workstationRef.current?.onVideoSaveClick();
      if (ok) {
        setTaskErrorMessage('');
        setTaskStatus('pending');
        setTaskProgress(0);
      }
    } catch (e) {
      console.error('handleGenerateVideo failed:', e);
      toast.error(locale === 'zh' ? '操作失败，请重试' : 'Request failed. Please try again.');
    } finally {
      setIsGeneratingVideo(false);
    }
  }, [explicitMissingVoiceIdSet.size, isGeneratingVideo, locale, persistPendingTimingsIfNeeded, t]);

  const executeUndoNow = useCallback(async () => {
    if (undoIntervalRef.current) {
      clearInterval(undoIntervalRef.current);
      undoIntervalRef.current = null;
    }

    let op = undoLatestOpRef.current;

    // Atomically transition countdown → loading in one React render batch
    setIsRollingBack(true);
    setUndoCountdown(0);

    if (!op && undoFetchPromiseRef.current) {
      op = await undoFetchPromiseRef.current;
    }

    if (!op) {
      toast.error(t('rollback.failed'));
      setIsRollingBack(false);
      return;
    }

    try {
      const resp = await fetch('/api/video-task/rollback-operation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: convertId,
          operationId: op.operationId,
        }),
      });
      const back = await resp.json().catch(() => null);
      if (!resp.ok || back?.code !== 0) {
        toast.error(back?.message || t('rollback.failed'));
        return;
      }

      setConvertObj((prevObj) => {
        if (!prevObj) return prevObj;
        return {
          ...prevObj,
          srt_convert_arr: back.data?.translate ?? prevObj.srt_convert_arr,
          srt_source_arr: back.data?.source ?? prevObj.srt_source_arr,
        };
      });

      toast.success(t('rollback.success'));
      latestOperationIdRef.current = null;
      try {
        const histResp = await fetch(`/api/video-task/operation-history?taskId=${convertId}`);
        const histData = await histResp.json();
        const stillHas = histData?.data?.some((op: any) => op.rollbackStatus === 0);
        setHasUndoableOps(Boolean(stillHas));
      } catch {
        setHasUndoableOps(false);
      }
    } catch {
      toast.error(t('rollback.failed'));
    } finally {
      setIsRollingBack(false);
      undoLatestOpRef.current = null;
      undoFetchPromiseRef.current = null;
    }
  }, [convertId, t]);

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

  const handleRollbackLatest = useCallback(() => {
    if (isRollingBack || undoCountdown > 0) return;

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

    undoFetchPromiseRef.current = fetch(
      `/api/video-task/operation-history?taskId=${convertId}`,
    )
      .then((r) => r.json())
      .then((data) => {
        const latest = data?.data?.find((op: any) => op.rollbackStatus === 0);
        if (!latest) {
          handleUndoCancel();
          toast.info(t('rollback.nothingToUndo'));
          return null;
        }
        undoLatestOpRef.current = latest;
        return latest;
      })
      .catch(() => {
        handleUndoCancel();
        toast.error(t('rollback.failed'));
        return null;
      });

    undoTimerRef.current = setTimeout(() => {
      undoTimerRef.current = null;
      executeUndoNow();
    }, 3000);
  }, [convertId, isRollingBack, undoCountdown, t, handleUndoCancel, executeUndoNow]);

  const handleSubtitleSplit = useCallback(async () => {
    if (!convertObj || isSplittingSubtitle) return;

    const splitAtMs = Math.round(currentTime * 1000);
    const clip = subtitleTrack.find((item) => splitAtMs >= Math.round(item.startTime * 1000) && splitAtMs < Math.round((item.startTime + item.duration) * 1000));
    if (!clip) {
      toast.error(t('videoEditor.toast.splitNoClip'));
      return;
    }

    const clipStartMs = Math.round(clip.startTime * 1000);
    const clipEndMs = Math.round((clip.startTime + clip.duration) * 1000);
    if (splitAtMs - clipStartMs < 200 || clipEndMs - splitAtMs < 200) {
      toast.error(t('videoEditor.toast.splitTooClose'));
      return;
    }

    setIsSplittingSubtitle(true);
    try {
      const okTiming = await persistPendingTimingsIfNeeded();
      if (!okTiming) return;

      if (isPlaying) handlePlayPause();

      const effectiveConvertText = typeof clip.text === 'string' ? clip.text : '';
      const resp = await fetch('/api/video-task/split-subtitle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taskId: convertId,
          clipId: clip.id,
          splitAtMs,
          effectiveConvertText,
        }),
      });
      const back = await resp.json().catch(() => null);
      if (!resp.ok || back?.code !== 0) {
        toast.error(back?.message || t('videoEditor.toast.splitFailed'));
        return;
      }

      const newTranslate: any[] = back.data?.translate ?? [];
      const firstSplitChildId: string | null = back.data?.newIds?.leftTranslateId ?? null;

      setConvertObj((prevObj) => {
        if (!prevObj) return prevObj;
        return {
          ...prevObj,
          srt_convert_arr: newTranslate.length > 0 ? newTranslate : prevObj.srt_convert_arr,
          srt_source_arr: back.data?.source ?? prevObj.srt_source_arr,
        };
      });
      setPlayingSubtitleIndex(-1);

      // 自动定位到第一个 split 子段
      if (firstSplitChildId) {
        setTimeout(() => {
          workstationRef.current?.scrollToItem(firstSplitChildId);
        }, 100);
      }

      const splitOpId = back.data?.splitOperationId;
      if (splitOpId) {
        latestOperationIdRef.current = splitOpId;
        setHasUndoableOps(true);
      }

      toast.success(t('videoEditor.toast.splitNeedVoice'));
    } catch (e) {
      console.error('handleSubtitleSplit failed:', e);
      toast.error(t('videoEditor.toast.splitFailed'));
    } finally {
      setIsSplittingSubtitle(false);
    }
  }, [convertId, convertObj, currentTime, handlePlayPause, isPlaying, isSplittingSubtitle, persistPendingTimingsIfNeeded, subtitleTrack, t]);


  const handleSeek = useCallback((time: number, isDragging: boolean = false, isAuditionSeek: boolean = false) => {
    const clampedTime = Math.max(0, Math.min(time, totalDuration));
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const videoEl = videoPreviewRef.current?.videoElement;

    if (isDragging) {
      // Drag-start: do the heavy reset once. Drag-move: only update UI/time at a throttled rate.
      if (!seekDragActiveRef.current) {
        seekDragActiveRef.current = true;

        // Cancel any pending warmup gate and stale play() promises.
        videoStartGateTokenRef.current += 1;
        videoPlayTokenRef.current += 1;
        transportIsStalledRef.current = false;
        setIsVideoBuffering(false);
        cancelUpdateLoop();

        // Reset subtitle-audio state once so we don't resume a stale segment after dragging.
        subtitleGraceUntilMsRef.current = now + 900;
        subtitleKickRef.current = null;
        subtitleRetryRef.current = null;
        subtitleWatchdogMsRef.current = now;
        subtitlePlayTokenRef.current += 1;
        lastPlayedSubtitleIndexRef.current = -1;
        setPlayingSubtitleIndex(-1);
        lastVoiceSubtitleIndexRef.current = -1;
        try { bufferingAbortRef.current?.abort(ABORT_REASON); } catch { /* ignore */ }
        bufferingAbortRef.current = null;
        setIsSubtitleBuffering(false);
        stopWebAudioVoice();
        abortAllVoiceInflight();

        // Pause while dragging to avoid races and "silent play" confusion.
        if (isPlaying || (videoEl && !videoEl.paused)) {
          try {
            videoEl?.pause();
          } catch {
            // ignore
          }
          try {
            bgmAudioRef.current?.pause();
          } catch {
            // ignore
          }
          setIsPlaying(false);
        }

        stopAllSubtitleAudio();
        isAudioRefArrPause.current = true;
      }

      seekDragLatestTimeRef.current = clampedTime;
      if (seekDragRafRef.current == null) {
        seekDragRafRef.current = requestAnimationFrame(() => {
          seekDragRafRef.current = null;
          if (!seekDragActiveRef.current) return;
          const t = seekDragLatestTimeRef.current;

          lastUiTimeRef.current = t;
          setCurrentTime(t);

          const msNow = typeof performance !== 'undefined' ? performance.now() : Date.now();
          if (msNow - seekDragLastMediaApplyMsRef.current < 140) return;
          seekDragLastMediaApplyMsRef.current = msNow;

          try {
            if (videoPreviewRef.current?.videoElement) videoPreviewRef.current.videoElement.currentTime = t;
          } catch {
            // ignore
          }
          try {
            if (bgmAudioRef.current) bgmAudioRef.current.currentTime = t;
          } catch {
            // ignore
          }
        });
      }

      return;
    }

    const wasDragging = seekDragActiveRef.current;
    seekDragActiveRef.current = false;
    if (seekDragRafRef.current != null) {
      cancelAnimationFrame(seekDragRafRef.current);
      seekDragRafRef.current = null;
    }

    // Any explicit seek should cancel stale play() promises; otherwise a late resolve can flip `isPlaying`.
    videoStartGateTokenRef.current += 1;
    videoPlayTokenRef.current += 1;
    transportIsStalledRef.current = false;
    setIsVideoBuffering(false);
    cancelUpdateLoop();

    lastUiTimeRef.current = clampedTime;
    setCurrentTime(clampedTime);

    // Drag-stop commit: we already reset audio state at drag-start; just commit time + unpause the audio gate.
    if (wasDragging) {
      isAudioRefArrPause.current = false;
      try {
        if (videoPreviewRef.current?.videoElement) videoPreviewRef.current.videoElement.currentTime = clampedTime;
      } catch {
        // ignore
      }
      try {
        if (bgmAudioRef.current) bgmAudioRef.current.currentTime = clampedTime;
      } catch {
        // ignore
      }
      const dragEndIdx = findSubtitleIndexAtTime(subtitleTrackRef.current, clampedTime);
      setPlayingSubtitleIndex(dragEndIdx);
      return;
    }

    // Click-to-seek: reset subtitle-audio state.
    if (!isAuditionSeek) {
      auditionTokenRef.current += 1;
      if (auditionRestoreRef.current) {
        const { subtitleMuted, bgmMuted, videoMuted } = auditionRestoreRef.current;
        setIsSubtitleMuted(subtitleMuted);
        isSubtitleMutedRef.current = subtitleMuted;
        setIsBgmMuted(bgmMuted);
        isBgmMutedRef.current = bgmMuted;
        if (videoPreviewRef.current?.videoElement) {
          videoPreviewRef.current.videoElement.muted = videoMuted;
        }
        auditionRestoreRef.current = null;
      }
      setAuditionActiveType(null);
      auditionActiveTypeRef.current = null;
      auditionStopAtMsRef.current = null;
      // Stop source audition audio when user seeks away from audition.
      try {
        if (sourceAuditionAudioRef.current) {
          sourceAuditionAudioRef.current.onended = null;
          sourceAuditionAudioRef.current.onerror = null;
          sourceAuditionAudioRef.current.ontimeupdate = null;
          sourceAuditionAudioRef.current.pause();
        }
      } catch { /* ignore */ }
    }

    // During audition seek, the caller (handleAuditionRequestPlay) manages
    // playingSubtitleIndex and playback — don't clobber its state.
    if (!isAuditionSeek) {
      subtitleGraceUntilMsRef.current = now + 900;
      subtitleKickRef.current = null;
      subtitleRetryRef.current = null;
      subtitleWatchdogMsRef.current = now;
      subtitlePlayTokenRef.current += 1;
      lastPlayedSubtitleIndexRef.current = -1;
      lastVoiceSubtitleIndexRef.current = -1;
      try { bufferingAbortRef.current?.abort(ABORT_REASON); } catch { /* ignore */ }
      bufferingAbortRef.current = null;
      setIsSubtitleBuffering(false);
      stopWebAudioVoice();
      abortAllVoiceInflight();

      isAudioRefArrPause.current = false;
      // Seeking is a user intent to reposition; pause playback to avoid "silent play" confusion.
      if (isPlaying || (videoEl && !videoEl.paused)) {
        try {
          videoEl?.pause();
        } catch {
          // ignore
        }
        try {
          bgmAudioRef.current?.pause();
        } catch {
          // ignore
        }
        stopAllSubtitleAudio();
        setIsPlaying(false);
      }
    }

    try {
      if (videoPreviewRef.current?.videoElement) videoPreviewRef.current.videoElement.currentTime = clampedTime;
    } catch {
      // ignore
    }
    try {
      if (bgmAudioRef.current) bgmAudioRef.current.currentTime = clampedTime;
    } catch {
      // ignore
    }

    stopAllSubtitleAudio();

    if (!isAuditionSeek) {
      const seekedIdx = findSubtitleIndexAtTime(subtitleTrackRef.current, clampedTime);
      setPlayingSubtitleIndex(seekedIdx);
    }
  }, [abortAllVoiceInflight, cancelUpdateLoop, findSubtitleIndexAtTime, isPlaying, stopAllSubtitleAudio, stopWebAudioVoice, totalDuration]);

  const handleSeekToSubtitle = useCallback((time: number) => {
    handleSeek(time, false);
  }, [handleSeek]);

  const handleGlobalVolume = useCallback((vol: number) => {
    setVolume(vol);
    const output = vol / 100;
    if (videoPreviewRef.current?.videoElement) videoPreviewRef.current.videoElement.volume = output;
    if (bgmAudioRef.current) bgmAudioRef.current.volume = output;
    audioRefArr.forEach(r => { if (r.current) r.current.volume = output; });
    if (sourceAuditionAudioRef.current) sourceAuditionAudioRef.current.volume = output;
  }, []);

  const handleUpdateSubtitleAudio = useCallback((id: string, url: string) => {
    setSubtitleTrack(prev => prev.map(item => item.id === id ? { ...item, audioUrl: url } : item));
  }, []);

  const handleSubtitleTextChange = useCallback((id: string, text: string) => {
    setSubtitleTrack(prev => prev.map(item => item.id === id ? { ...item, text } : item));
  }, []);

  const handleToggleBgmMute = useCallback(() => {
    setIsBgmMuted((v) => !v);
  }, []);

  const handleToggleSubtitleMute = useCallback(() => {
    setIsSubtitleMuted((v) => !v);
  }, []);

  const handleAuditionStop = useCallback((naturalEnd = false) => {
    // Cancel any in-flight warmup/play so it can't flip state later.
    videoStartGateTokenRef.current += 1;
    videoPlayTokenRef.current += 1;
    transportIsStalledRef.current = false;
    setIsVideoBuffering(false);

    const endedIndex = playingSubtitleIndexRef.current ?? -1;
    const endedType = auditionActiveTypeRef.current;

    try {
      videoPreviewRef.current?.videoElement?.pause();
    } catch {
      // ignore
    }
    // Stop source audition audio if playing.
    try {
      if (sourceAuditionAudioRef.current) {
        sourceAuditionAudioRef.current.onended = null;
        sourceAuditionAudioRef.current.onerror = null;
        sourceAuditionAudioRef.current.ontimeupdate = null;
        sourceAuditionAudioRef.current.pause();
      }
    } catch { /* ignore */ }

    setIsPlaying(false);
    auditionStopAtMsRef.current = null;
    setPlayingSubtitleIndex(-1);
    setAuditionActiveType(null);
    auditionActiveTypeRef.current = null;

    if (auditionRestoreRef.current) {
      const { subtitleMuted, bgmMuted, videoMuted } = auditionRestoreRef.current;
      setIsSubtitleMuted(subtitleMuted);
      isSubtitleMutedRef.current = subtitleMuted; // Sync ref immediately
      setIsBgmMuted(bgmMuted);
      isBgmMutedRef.current = bgmMuted; // Sync ref immediately
      if (videoPreviewRef.current?.videoElement) {
        videoPreviewRef.current.videoElement.muted = videoMuted;
      }
      auditionRestoreRef.current = null;
    }

    if (naturalEnd && isAutoPlayNextRef.current && endedIndex >= 0) {
      const nextIdx = endedIndex + 1;
      if (nextIdx < subtitleTrackRef.current.length) {
        setTimeout(() => {
          // Re-trigger via document event to avoid hook cycles
          document.dispatchEvent(new CustomEvent('revoice-audition-request-play', { detail: { index: nextIdx, mode: endedType } }));
        }, 50);
      }
    }
  }, []);

  useEffect(() => {
    const handleNaturalStop = () => handleAuditionStop(true);
    document.addEventListener('revoice-audition-natural-stop', handleNaturalStop);
    return () => document.removeEventListener('revoice-audition-natural-stop', handleNaturalStop);
  }, [handleAuditionStop]);

  const handleAuditionRequestPlay = useCallback(async (index: number, mode: 'source' | 'convert') => {
    if (index < 0 || index >= subtitleTrackRef.current.length) return;
    const item = subtitleTrackRef.current[index];
    const token = ++auditionTokenRef.current;

    // Stop any previous source audition audio.
    try { sourceAuditionAudioRef.current?.pause(); } catch { /* ignore */ }

    if (!auditionRestoreRef.current) {
      auditionRestoreRef.current = {
        subtitleMuted: isSubtitleMutedRef.current,
        bgmMuted: isBgmMutedRef.current,
        videoMuted: videoPreviewRef.current?.videoElement?.muted ?? false,
      };
    }

    setPlayingSubtitleIndex(index);
    playingSubtitleIndexRef.current = index;
    setAuditionActiveType(mode);
    auditionActiveTypeRef.current = mode;
    auditionStopAtMsRef.current = item.startTime * 1000 + item.duration * 1000;

    const videoEl = videoPreviewRef.current?.videoElement;
    if (mode === 'convert') {
      setIsSubtitleMuted(false);
      isSubtitleMutedRef.current = false;
      if (videoEl) videoEl.muted = true;
    } else {
      setIsSubtitleMuted(true);
      isSubtitleMutedRef.current = true;
      if (videoEl) videoEl.muted = true;
    }

    setIsBgmMuted(true);
    isBgmMutedRef.current = true;

    handleSeek(item.startTime, false, true);

    if (mode === 'source' && convertObj) {
      // --- Source audition: split rows should go straight to vocal fallback instead of waiting for a missing segment file. ---
      const sourceEntry = convertObj.srt_source_arr?.[index];
      const sourceId = sourceEntry?.id || String(index + 1);
      const userId = user?.id || '';
      const sourceAudioUrl = `${convertObj.r2preUrl}/${convertObj.env}/${userId}/${convertObj.id}/split_audio/audio/${sourceId}.wav`;
      const sourceMode = resolveSourcePlaybackMode(sourceEntry);
      console.log('[SourceAudition] url:', sourceAudioUrl, 'sourceId:', sourceId, 'userId:', userId, 'mode:', sourceMode);

      if (!sourceAuditionAudioRef.current) {
        sourceAuditionAudioRef.current = new Audio();
      }
      const audioEl = sourceAuditionAudioRef.current;
      audioEl.volume = volumeRef.current / 100;
      audioEl.ontimeupdate = null;
      audioEl.onerror = null;
      audioEl.onended = null;

      const parseSrtTime = (s: string) => {
        const [hms, ms] = s.split(',');
        const [h, m, sec] = hms.split(':').map(Number);
        return h * 3600 + m * 60 + sec + (Number(ms) || 0) / 1000;
      };

      const applyVocalFallback = async () => {
        if (!convertObj.vocalAudioUrl || !sourceEntry?.start) return { ready: false, gesturePlayPromise: null as Promise<void> | null };
        audioEl.preload = 'auto';
        audioEl.src = convertObj.vocalAudioUrl;
        const startSec = parseSrtTime(sourceEntry.start);
        const endSec = sourceEntry.end ? parseSrtTime(sourceEntry.end) : startSec + 10;
        audioEl.currentTime = startSec;
        audioEl.ontimeupdate = () => {
          if (audioEl.currentTime >= endSec) {
            audioEl.ontimeupdate = null;
            audioEl.onended = null;
            audioEl.pause();
            document.dispatchEvent(new CustomEvent('revoice-audition-natural-stop'));
          }
        };
        audioEl.load();
        const gesturePlayPromise = audioEl.play().catch(() => { /* expected pause below */ });
        audioEl.pause();
        const ready = await waitForAudioReady(audioEl, { timeoutMs: 2500 });
        return { ready, gesturePlayPromise };
      };

      let audioOk = false;
      let gesturePlayPromise: Promise<void> | null = null;

      if (sourceMode === 'fallback_vocal') {
        const fallback = await applyVocalFallback();
        audioOk = fallback.ready;
        gesturePlayPromise = fallback.gesturePlayPromise;
        if (token !== auditionTokenRef.current) return;
      } else {
        audioEl.src = sourceAudioUrl;
        audioEl.currentTime = 0;
        audioEl.load();

        gesturePlayPromise = audioEl.play().catch(() => { /* expected pause below */ });
        audioEl.pause();

        audioOk = await waitForAudioReady(audioEl, { timeoutMs: 4000 });
        if (token !== auditionTokenRef.current) return;

        if (!audioOk) {
          console.warn('[SourceAudition] segment load failed, falling back to vocalAudioUrl');
          const fallback = await applyVocalFallback();
          audioOk = fallback.ready;
          if (!gesturePlayPromise) gesturePlayPromise = fallback.gesturePlayPromise;
          if (token !== auditionTokenRef.current) return;
        }
      }

      // Wait for the initial gesture play promise to settle before proceeding.
      if (gesturePlayPromise) await gesturePlayPromise;

      if (!audioOk) {
        console.error('[SourceAudition] all audio sources failed');
        toast.error(t('videoEditor.toast.audioLoadFailed') || 'Audio load failed');
        return;
      }

      if (token !== auditionTokenRef.current) return;

      // Both audio and video start together
      audioEl.onended = () => {
        document.dispatchEvent(new CustomEvent('revoice-audition-natural-stop'));
      };
      audioEl.play().catch((err) => {
        console.error('[SourceAudition] play failed:', err);
      });
      if (videoEl) playVideoWithGate(videoEl, { reason: 'audition' });

    } else if (mode === 'convert') {
      // --- Convert audition: ensure voice buffer decoded before starting video ---
      const seg = subtitleTrackRef.current[index];
      const voiceUrl = (seg?.audioUrl || '').trim();

      if (voiceUrl && !cacheGetVoice(voiceUrl)) {
        try {
          const ctrl = new AbortController();
          await ensureVoiceBuffer(voiceUrl, ctrl.signal);
        } catch {
          // Decode failed; syncVoicePlaybackWebAudio will handle fallback at runtime.
        }
        if (token !== auditionTokenRef.current) return;
      }

      if (videoEl) playVideoWithGate(videoEl, { reason: 'audition' });
    }
  }, [cacheGetVoice, convertObj, ensureVoiceBuffer, handleSeek, playVideoWithGate, t, user?.id]);

  useEffect(() => {
    const handleEventRequestPlay = (e: any) => handleAuditionRequestPlay(e.detail.index, e.detail.mode);
    document.addEventListener('revoice-audition-request-play', handleEventRequestPlay);
    return () => document.removeEventListener('revoice-audition-request-play', handleEventRequestPlay);
  }, [handleAuditionRequestPlay]);

  const handleAuditionToggle = useCallback(() => {
    handlePlayPause();
  }, [handlePlayPause]);

  useEffect(() => {
    const handleEditorKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        handleRollbackLatest();
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPause();
        return;
      }
    };

    window.addEventListener('keydown', handleEditorKeyDown);
    return () => window.removeEventListener('keydown', handleEditorKeyDown);
  }, [handlePlayPause, handleRollbackLatest]);

  // --- RENDER ---
  if (isLoading) return <LoadingSkeleton />;
  if (error) return (
    <ErrorState
      title={t('error.loadFailed')}
      detail={error}
      action={
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          {locale === 'zh' ? '重试' : 'Retry'}
        </Button>
      }
    />
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-background/40 shadow-xl backdrop-blur-xl m-1 sm:m-3">
      {/* Ambient backdrop: subtle motion + depth (keeps the editor feeling "alive" without being noisy). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-48 left-1/2 h-[420px] w-[1200px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/[0.03] via-white/[0.01] to-transparent blur-[90px] opacity-50" />
        <div className="absolute -bottom-56 right-[-18%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/[0.02] via-transparent to-transparent blur-[80px] opacity-40" />
        <RetroGrid
          className="opacity-25 mix-blend-screen motion-reduce:opacity-0"
          angle={72}
          cellSize={78}
          opacity={0.22}
          lightLineColor="rgba(255, 255, 255, 0.04)"
          darkLineColor="rgba(255, 255, 255, 0.04)"
        />
      </div>

      {/* Header */}
      <div className="relative flex items-start justify-between gap-4 border-b border-white/10 bg-card/40 px-4 py-2.5 backdrop-blur-xl">
        <div className="flex min-w-0 items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="mt-0.5 rounded-full"
                onClick={handleBackClick}
                aria-label={t('header.backToProject')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t('header.backToProject')}</TooltipContent>
          </Tooltip>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="min-w-0 truncate text-base font-semibold">
                {videoSource?.fileName || t('breadcrumb.videoEditor')}
              </h1>

              {convertObj ? (
                <Badge className="gap-1 border border-primary/20 bg-primary/10 text-primary">
                  <Sparkles className="h-3 w-3" />
                  {getLanguageConvertStr(convertObj, locale)}
                </Badge>
              ) : null}

              {convertObj ? (
                <Badge
                  variant="outline"
                  className={cn('gap-2 border-white/10 bg-white/[0.03] text-muted-foreground', statusMeta.cls)}
                  title={`${statusMeta.label} · ${progressPercent}%`}
                >
                  {statusMeta.icon === 'spin' ? (
                    <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
                  ) : statusMeta.icon === 'check' ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : statusMeta.icon === 'x' ? (
                    <XCircle className="h-3 w-3" />
                  ) : (
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-30 animate-ping motion-reduce:animate-none" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-current opacity-70" />
                    </span>
                  )}
                  <span className="text-xs">{statusMeta.label}</span>
                  <span className="font-mono text-xs tabular-nums text-foreground/80">
                    {progressPercent}%
                  </span>
                </Badge>
              ) : null}

              <Badge
                variant="outline"
                className="border-white/10 bg-white/[0.03] text-muted-foreground"
              >
                {Math.round(totalDuration)}s
              </Badge>
            </div>

            {pendingMergeCount > 0 ? (
              <div className="mt-1 text-xs text-primary/90">
                {locale === 'zh'
                  ? `待应用：${pendingMergeVoiceCount} 段配音 · ${pendingMergeTimingCount} 段时间`
                  : `Pending: ${pendingMergeVoiceCount} voice · ${pendingMergeTimingCount} timing`}
              </div>
            ) : null}

            {taskStatus === 'failed' && taskErrorMessage ? (
              <ErrorBlock message={taskErrorMessage} className="mt-2" />
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full"
                aria-label={locale === 'zh' ? '积分说明' : 'Credits info'}
              >
                <Info className="h-4 w-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80">
              <div className="space-y-3">
                <div className="text-sm font-semibold">
                  {locale === 'zh' ? '积分消耗说明' : 'Credit usage'}
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between rounded-md border border-white/10 bg-muted/10 px-3 py-2">
                    <span className="text-muted-foreground">
                      {locale === 'zh' ? '重翻译字幕' : 'Retranslate subtitle'}
                    </span>
                    <span className="font-mono text-primary">1</span>
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-white/10 bg-muted/10 px-3 py-2">
                    <span className="text-muted-foreground">
                      {locale === 'zh' ? '更新字幕语音' : 'Regenerate voice'}
                    </span>
                    <span className="font-mono text-primary">2</span>
                  </div>
                </div>

                <div className="text-xs leading-relaxed text-muted-foreground">
                  {locale === 'zh'
                    ? '小提示：我们会在积分不足时提醒你；生成失败会自动退回积分。'
                    : 'Tip: We’ll prompt you when credits are insufficient. Credits are refunded automatically if generation fails.'}
                </div>

                <div className="border-t border-white/10 pt-3">
                  <div className="text-xs font-medium text-muted-foreground/90 mb-2">
                    {locale === 'zh' ? '快捷操作' : 'Quick tips'}
                  </div>
                  <ul className="space-y-1.5 text-xs text-muted-foreground">
                    <li className="flex items-center gap-2">
                      <kbd className="shrink-0 rounded border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium">Space</kbd>
                      <span>{locale === 'zh' ? '播放 / 暂停' : 'Play / Pause'}</span>
                    </li>
                    <li className="flex items-center gap-2">
                      <kbd className="shrink-0 rounded border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium">⌘Z</kbd>
                      <span>{locale === 'zh' ? '撤销操作' : 'Undo'}</span>
                    </li>
                    <li>{locale === 'zh' ? '双击字幕行可定位到对应时间' : 'Double-click a subtitle row to seek'}</li>
                  </ul>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex">
                <Button
                  size="sm"
                  className={cn("gap-2 transition-all", (isTaskRunning || isMergeJobActive) && "bg-primary/20 text-primary-foreground pointer-events-none")}
                  onClick={handleGenerateVideo}
                  disabled={isGeneratingVideo || isTaskRunning || isMergeJobActive || pendingMergeCount === 0}
                >
                  {isGeneratingVideo || isTaskRunning || isMergeJobActive ? (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  ) : null}
                  {isMergeJobActive ? (
                    <span>
                      {locale === 'zh' ? '视频合成中...' : 'Merging video...'}
                    </span>
                  ) : isTaskRunning ? (
                    <span>
                      {taskStatus === 'pending'
                        ? (locale === 'zh' ? '排队中...' : 'Queued...')
                        : (locale === 'zh' ? `生成中 ${taskProgress ?? 0}%` : `Generating ${taskProgress ?? 0}%`)}
                    </span>
                  ) : (
                    t('audioList.saveTooltip')
                  )}
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {isMergeJobActive
                ? t('header.mergingVideo')
                : pendingMergeCount === 0
                  ? t('header.noChanges')
                  : t('header.regenerateTooltip')}
            </TooltipContent>
          </Tooltip>
        </div>

        {convertObj ? (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-white/5">
            <div className="h-full" style={{ width: `${headerProgressVisual}%` }}>
              <div className={cn('relative h-full w-full', headerProgressFillCls)}>
                {isTaskRunning ? (
                  <div
                    aria-hidden
                    className={cn(
                      'absolute inset-0 opacity-45',
                      '[background:linear-gradient(90deg,transparent,oklch(1_0_0_/_0.55),transparent)]',
                      '[background-size:220%_100%]',
                      'animate-shimmer motion-reduce:animate-none'
                    )}
                  />
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* Body (user-tunable dock layout: resizable columns + resizable timeline height). */}
      <div ref={bodyRef} className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        {/* Workspace */}
        <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-background/25 shadow-[0_18px_60px_rgba(0,0,0,0.35)]">
          <ResizableSplitPanel
            className="h-full w-full"
            defaultLeftWidthPercent={58}
            minLeftWidthPercent={40}
            minRightWidthPercent={20}
            minRightWidthPx={320}
            leftPanel={
              <div className="h-full bg-background/20">
                <SubtitleWorkstation
                  ref={workstationRef}
                  convertObj={convertObj}
                  playingSubtitleIndex={playingSubtitleIndex}
                  onSeekToSubtitle={handleSeekToSubtitle}
                  onUpdateSubtitleAudioUrl={handleUpdateSubtitleAudio}
                  onSubtitleTextChange={handleSubtitleTextChange}
                  onPendingVoiceIdsChange={handlePendingVoiceIdsChange}
                  onVideoMergeCompleted={handleVideoMergeCompleted}
                  onVideoMergeStarted={handleVideoMergeStarted}
                  onVideoMergeFailed={handleVideoMergeFailed}
                  onRequestAuditionPlay={handleAuditionRequestPlay}
                  onRequestAuditionToggle={handleAuditionToggle}
                  onRequestAuditionStop={() => handleAuditionStop(false)}
                  auditionPlayingIndex={playingSubtitleIndex}
                  auditionActiveType={auditionActiveType}
                  isMediaPlaying={isPlaying}
                  isAutoPlayNext={isAutoPlayNext}
                  onToggleAutoPlayNext={setIsAutoPlayNext}
                  onDirtyStateChange={setWorkstationDirty}
                />
              </div>
            }
            rightPanel={
              <div className="h-full bg-black/95">
                <VideoPreviewPanel
                  ref={videoPreviewRef}
                  isPlaying={isPlaying}
                  subtitleTrack={subtitleTrack}
                  activeSubtitleIndex={playingSubtitleIndex}
                  videoUrl={videoTrack[0]?.url}
                  onPlayStateChange={setIsPlaying}
                  className="rounded-none"
                />
              </div>
            }
          />
        </div>

        {/* Timeline resize handle */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label={locale === 'zh' ? '调整时间线高度' : 'Resize timeline height'}
          className={cn(
            'group relative h-4 shrink-0 cursor-row-resize select-none',
            'rounded-md bg-white/[0.03] hover:bg-white/5 transition-colors'
          )}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            const el = e.currentTarget as HTMLDivElement;
            const body = bodyRef.current;
            if (!body) return;

            const rect = body.getBoundingClientRect();
            // Keep workspace usable: reserve at least 240px.
            const maxHeight = Math.max(120, Math.min(520, Math.floor(rect.height - 240)));

            timelineDragRef.current = {
              pointerId: e.pointerId,
              startY: e.clientY,
              startHeight: timelineHeightPx,
              maxHeight,
            };
            el.setPointerCapture(e.pointerId);
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
          }}
          onPointerMove={(e) => {
            const st = timelineDragRef.current;
            if (!st || e.pointerId !== st.pointerId) return;
            const dy = st.startY - e.clientY; // drag up => bigger timeline
            const next = Math.max(120, Math.min(st.maxHeight, Math.round(st.startHeight + dy)));
            setTimelineHeightPx(next);
          }}
          onPointerUp={(e) => {
            const st = timelineDragRef.current;
            if (!st || e.pointerId !== st.pointerId) return;
            timelineDragRef.current = null;
            try {
              (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
            } catch {
              // ignore
            }
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            try {
              window.localStorage.setItem(LAYOUT_TIMELINE_H_KEY, String(timelineHeightRef.current));
            } catch {
              // ignore
            }
          }}
          onPointerCancel={(e) => {
            const st = timelineDragRef.current;
            timelineDragRef.current = null;
            if (st) {
              try {
                (e.currentTarget as HTMLDivElement).releasePointerCapture(st.pointerId);
              } catch {
                // ignore
              }
            }
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
          }}
        >
          <div aria-hidden className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-white/10 group-hover:bg-white/15 transition-colors" />
          <div
            aria-hidden
            className={cn(
              'absolute left-1/2 top-1/2 h-1.5 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all duration-200',
              'bg-white/15 group-hover:bg-primary/40 group-hover:w-16'
            )}
          />
        </div>

        {/* Timeline */}
        <div
          className="min-h-[120px] overflow-auto rounded-xl border border-white/10 bg-background/25 shadow-[0_18px_60px_rgba(0,0,0,0.35)]"
          style={{ height: `${timelineHeightPx}px` }}
        >
          <TimelinePanel
            totalDuration={totalDuration}
            currentTime={currentTime}
            isPlaying={isPlaying}
            isBuffering={isSubtitleBuffering || isVideoBuffering}
            playingSubtitleIndex={playingSubtitleIndex}
            subtitleTrack={subtitleTrack}
            subtitleTrackOriginal={subtitleTrackOriginal.length ? subtitleTrackOriginal : undefined}
            onSubtitleTrackChange={handleSubtitleTrackChange}
            vocalWaveformUrl={convertObj?.vocalAudioUrl}
            bgmWaveformUrl={convertObj?.backgroundAudioUrl}
            zoom={zoom}
            volume={volume}
            isBgmMuted={isBgmMuted}
            isSubtitleMuted={isSubtitleMuted}
            onPlayPause={handlePlayPause}
            onSeek={handleSeek}
            onZoomChange={setZoom}
            onVolumeChange={handleGlobalVolume}
            onToggleBgmMute={handleToggleBgmMute}
            onToggleSubtitleMute={handleToggleSubtitleMute}
            onSplitAtCurrentTime={handleSubtitleSplit}
            splitDisabled={(!convertObj || isGeneratingVideo || isSplittingSubtitle || !subtitleTrack.some((item) => { const ms = Math.round(currentTime * 1000); const startMs = Math.round(item.startTime * 1000); const endMs = Math.round((item.startTime + item.duration) * 1000); return ms >= startMs && ms < endMs && ms - startMs >= 200 && endMs - ms >= 200; }))}
            splitLoading={isSplittingSubtitle}
            onUndo={hasUndoableOps ? handleRollbackLatest : undefined}
            undoLoading={isRollingBack}
            undoCountdown={undoCountdown}
            onUndoCancel={handleUndoCancel}
          />
        </div>
      </div>

      {/* Unsaved changes confirmation dialog */}
      <Dialog open={showLeaveDialog} onOpenChange={(open) => { if (!open) cancelLeave(); }}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('unsavedDialog.title')}</DialogTitle>
            <DialogDescription>{t('unsavedDialog.description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={cancelLeave}>
              {t('unsavedDialog.stay')}
            </Button>
            <Button variant="destructive" onClick={confirmLeave}>
              {t('unsavedDialog.leave')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function LoadingSkeleton() {
  return <div className="p-10 flex flex-col gap-4">
    <Skeleton className="h-14 w-full" />
    <div className="flex-1 flex gap-4">
      <Skeleton className="w-16 h-full" />
      <Skeleton className="flex-1 h-full" />
      <Skeleton className="w-[400px] h-full" />
    </div>
    <Skeleton className="h-64 w-full" />
  </div>;
}

