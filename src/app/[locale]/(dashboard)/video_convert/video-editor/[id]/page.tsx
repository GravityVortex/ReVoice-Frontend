"use client";

import React, { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { ArrowLeft, CheckCircle2, Info, Loader2, Sparkles, XCircle, Zap } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { ConvertObj, TrackItem, SubtitleTrackItem } from '@/shared/components/video-editor/types';
import { cn, getLanguageConvertStr } from '@/shared/lib/utils';
import { estimateTaskPercent } from '@/shared/lib/task-progress';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { useAppContext } from '@/shared/contexts/app';
import { RetroGrid } from '@/shared/components/magicui/retro-grid';
import { toast } from 'sonner';
import { ResizableSplitPanel } from '@/shared/components/resizable-split-panel';
import { createLimitedTaskQueue } from '@/shared/lib/waveform/loader';
import { getBufferedAheadSeconds } from '@/shared/lib/media-buffer';

// New Components
import { SubtitleWorkstation } from './subtitle-workstation';
import { VideoPreviewPanel, VideoPreviewRef } from './video-preview-panel';
import { TimelinePanel } from './timeline-panel';

function isAbortError(err: unknown) {
  return (
    typeof err === 'object' &&
    err !== null &&
    // DOMException.name is "AbortError"
    // Some browsers expose a numeric code (20) for abort.
    (((err as any).name === 'AbortError') || (err as any).code === 20)
  );
}

export default function VideoEditorPage() {
  const params = useParams();
  const convertId = params.id as string;
  const locale = (params.locale as string) || "zh";
  const t = useTranslations('video_convert.videoEditor');
  const tDetail = useTranslations('video_convert.projectDetail');
  const { user } = useAppContext();
  const remainingCredits = user?.credits?.remainingCredits ?? 0;

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
  const [zoom, setZoom] = useState(1);
  const [playingSubtitleIndex, setPlayingSubtitleIndex] = useState<number>(-1);
  const [pendingChangesCount, setPendingChangesCount] = useState(0);
  const [pendingTimingMap, setPendingTimingMap] = useState<Record<string, { startMs: number; endMs: number }>>({});
  const pendingTimingCount = useMemo(() => Object.keys(pendingTimingMap).length, [pendingTimingMap]);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);

  // --- LAYOUT (keep it user-tunable; defaults should feel roomy) ---
  const LAYOUT_TIMELINE_H_KEY = 'revoice.video_editor.timeline_h_v1';
  const [timelineHeightPx, setTimelineHeightPx] = useState(260);
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
      if (Number.isFinite(n) && n >= 180 && n <= 520) setTimelineHeightPx(n);
    } catch {
      // ignore
    }
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
  const workstationRef = useRef<{ onVideoSaveClick: () => Promise<boolean> }>(null);
  // Ignore stale video `play()` promise resolutions/rejections when users toggle quickly.
  const videoPlayTokenRef = useRef(0);
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
  const handlePendingChangesChange = useCallback((count: number) => {
    setPendingChangesCount(count);
  }, []);

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

  const handleGenerateVideo = useCallback(async () => {
    if (isGeneratingVideo) return;
    setIsGeneratingVideo(true);
    try {
      // Persist timing edits in one request before triggering merge.
      if (pendingTimingCount > 0) {
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
          return;
        }

        // External merge still depends on legacy "id-encoded timings", so timing edits
        // may rename ids. Sync local state to keep subsequent edits stable.
        const idMap = (back?.data?.idMap ?? {}) as Record<string, string>;
        if (idMap && Object.keys(idMap).length > 0) {
          setConvertObj((prevObj) => {
            if (!prevObj) return prevObj;
            const arr = (prevObj.srt_convert_arr || []) as any[];
            const nextArr = arr.map((row) => {
              const id = row?.id;
              if (typeof id !== 'string') return row;
              const nextId = idMap[id];
              if (typeof nextId !== 'string' || nextId.length === 0 || nextId === id) return row;
              return { ...row, id: nextId };
            });
            return { ...prevObj, srt_convert_arr: nextArr };
          });
        }

        // The timing edits are persisted at this point.
        setPendingTimingMap({});
      }

      const ok = await workstationRef.current?.onVideoSaveClick();
      if (ok) {
        setTaskErrorMessage('');
        // Optimistic: give immediate feedback that work has started.
        setTaskStatus('pending');
        setTaskProgress(0);
      }
    } catch (e) {
      console.error('handleGenerateVideo failed:', e);
      toast.error(locale === 'zh' ? '操作失败，请重试' : 'Request failed. Please try again.');
    } finally {
      setIsGeneratingVideo(false);
    }
  }, [convertId, isGeneratingVideo, locale, pendingTimingCount, pendingTimingMap]);

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
        cls: 'text-cyan-600 border-cyan-600/20 bg-cyan-500/5',
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
          const pathName = draftPath || `adj_audio_time/${entry.id}.wav`;

          const updatedAtMsRaw = (entry as any)?.vap_tts_updated_at_ms;
          const updatedAtMs =
            typeof updatedAtMsRaw === 'number'
              ? updatedAtMsRaw
              : Number.parseInt(String(updatedAtMsRaw || ''), 10);
          const cacheBuster =
            Number.isFinite(updatedAtMs) && updatedAtMs > 0 ? String(updatedAtMs) : '';

          const base =
            /^https?:\/\//i.test(pathName)
              ? pathName
              : `${convertObj.r2preUrl}/${convertObj.env}/${userId}/${convertObj.id}/${pathName}`;
          const audioUrl = cacheBuster
            ? `${base}${base.includes('?') ? '&' : '?'}t=${encodeURIComponent(cacheBuster)}`
            : base;
          return {
            id: entry.id, type: 'video', name: `Sub ${index + 1}`,
            startTime: start, duration: Math.max(0, end - start), text: entry.txt,
            fontSize: 16, color: '#ffffff', audioUrl
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
    bufferingAbortRef.current?.abort();
    bufferingAbortRef.current = null;
    pausePrefetchAbortRef.current?.abort();
    pausePrefetchAbortRef.current = null;
    for (const v of voiceInflightRef.current.values()) {
      try {
        v.controller.abort();
      } catch {
        // ignore
      }
    }
    voiceInflightRef.current.clear();
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
    const direct = async (url: string) => {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      const resp = await fetch(url, { signal });
      if (!resp.ok) throw new Error(`fetch failed: ${resp.status}`);
      return await resp.arrayBuffer();
    };

    try {
      return await direct(raw);
    } catch (e) {
      if (signal.aborted) throw e;
      // If direct fetch is blocked by CORS (TypeError), retry via same-origin proxy when allowed.
      const proxy = toWebAudioFetchUrl(raw);
      if (proxy && proxy !== raw) return await direct(proxy);
      throw e;
    }
  }, [toWebAudioFetchUrl]);

  const decodeVoiceBuffer = useCallback(async (url: string, signal: AbortSignal) => {
    const ctx = getOrCreateVoiceAudioCtx();
    const ab = await fetchAudioArrayBuffer(url, signal);
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

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
    const onAbort = () => controller.abort();
    signal.addEventListener('abort', onAbort, { once: true });

    const promise = voiceDecodeQueue
      .enqueue((queueSignal) => decodeVoiceBuffer(key, queueSignal), controller.signal)
      .then((buf) => {
        cacheSetVoice(key, buf);
        return buf;
      })
      .finally(() => {
        voiceInflightRef.current.delete(key);
        signal.removeEventListener('abort', onAbort);
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
        const onAbort = () => ctrl.abort();
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
    bufferingAbortRef.current?.abort();
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
        setPlayingSubtitleIndex(-1);
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
      pausePrefetchAbortRef.current?.abort();
      pausePrefetchAbortRef.current = null;
      return;
    }

    const videoEl = videoPreviewRef.current?.videoElement;
    if (!videoEl || !(videoEl.currentSrc || videoEl.src)) return;

    const anchor = Number.isFinite(videoEl.currentTime) ? (videoEl.currentTime || 0) : currentTime;
    if (subtitleBackendRef.current === 'webaudio') {
      const ctrl = new AbortController();
      pausePrefetchAbortRef.current?.abort();
      pausePrefetchAbortRef.current = ctrl;

      // Keep a small forward runway warm while paused so resume does not rebuffer voices.
      prefetchVoiceAroundTime(anchor, { count: getAdaptivePrefetchCount('pause'), signal: ctrl.signal });

      return () => {
        ctrl.abort();
        if (pausePrefetchAbortRef.current === ctrl) {
          pausePrefetchAbortRef.current = null;
        }
      };
    }

    pausePrefetchAbortRef.current?.abort();
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
    const videoEl = videoPreviewRef.current?.videoElement;
    if (isSubtitleBuffering) {
      bufferingAbortRef.current?.abort();
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

  const handleSeek = useCallback((time: number, isDragging: boolean = false) => {
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
        bufferingAbortRef.current?.abort();
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
      return;
    }

    // Click-to-seek: reset subtitle-audio state.
    subtitleGraceUntilMsRef.current = now + 900;
    subtitleKickRef.current = null;
    subtitleRetryRef.current = null;
    subtitleWatchdogMsRef.current = now;
    subtitlePlayTokenRef.current += 1;
    lastPlayedSubtitleIndexRef.current = -1;
    setPlayingSubtitleIndex(-1);
    lastVoiceSubtitleIndexRef.current = -1;
    bufferingAbortRef.current?.abort();
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
    // Seeking should not auto-play voice; the playback loop will resync when the user hits Play.
  }, [abortAllVoiceInflight, cancelUpdateLoop, isPlaying, stopAllSubtitleAudio, stopWebAudioVoice, totalDuration]);

  const handleSeekToSubtitle = useCallback((time: number) => {
    handleSeek(time, false);
  }, [handleSeek]);

  const handleGlobalVolume = useCallback((vol: number) => {
    setVolume(vol);
    const output = vol / 100;
    if (videoPreviewRef.current?.videoElement) videoPreviewRef.current.videoElement.volume = output;
    if (bgmAudioRef.current) bgmAudioRef.current.volume = output;
    audioRefArr.forEach(r => { if (r.current) r.current.volume = output; });
  }, []);

  const handleUpdateSubtitleAudio = useCallback((id: string, url: string) => {
    setSubtitleTrack(prev => prev.map(item => item.id === id ? { ...item, audioUrl: url } : item));
  }, []);

  const handleToggleBgmMute = useCallback(() => {
    setIsBgmMuted((v) => !v);
  }, []);

  const handleToggleSubtitleMute = useCallback(() => {
    setIsSubtitleMuted((v) => !v);
  }, []);

  // --- RENDER ---
  if (isLoading) return <LoadingSkeleton />;
  if (error) return <ErrorDisplay error={error} />;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-background/40 shadow-xl backdrop-blur-xl">
      {/* Ambient backdrop: subtle motion + depth (keeps the editor feeling "alive" without being noisy). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-48 left-1/2 h-[420px] w-[1200px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-primary/5 to-transparent blur-[90px] opacity-70" />
        <div className="absolute -bottom-56 right-[-18%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-sky-400/10 via-sky-400/0 to-transparent blur-[80px] opacity-60" />
        <RetroGrid
          className="opacity-25 mix-blend-screen motion-reduce:opacity-0"
          angle={72}
          cellSize={78}
          opacity={0.22}
          lightLineColor="rgba(167, 139, 250, 0.20)"
          darkLineColor="rgba(167, 139, 250, 0.20)"
        />
      </div>

      {/* Header */}
      <div className="relative flex items-start justify-between gap-4 border-b border-white/10 bg-card/40 px-4 py-3 backdrop-blur-xl">
        <div className="flex min-w-0 items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="mt-0.5 rounded-full"
            asChild
          >
            <Link
              href={
                convertObj?.originalFileId
                  ? `/dashboard/projects/${convertObj.originalFileId}`
                  : '/dashboard/projects'
              }
              aria-label={locale === 'zh' ? '返回项目' : 'Back to project'}
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>

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

            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>
                {locale === 'zh'
                  ? '重翻译 1/段 · 更新配音 2/段'
                  : 'Retranslate 1/seg · Voice 2/seg'}
              </span>
              <span className="text-muted-foreground/50">·</span>
              <span>
                {locale === 'zh'
                  ? '双击字幕行可定位到对应时间'
                  : 'Double-click a subtitle row to jump to time'}
              </span>
              <span className="text-muted-foreground/50">·</span>
              <span>
                {locale === 'zh'
                  ? '积分不足会提示'
                  : 'We’ll prompt you if credits are insufficient'}
              </span>
              {pendingChangesCount + pendingTimingCount > 0 ? (
                <>
                  <span className="text-muted-foreground/50">·</span>
                  <span className="text-primary/90">
                    {locale === 'zh'
                      ? `待应用：${pendingChangesCount} 段配音 · ${pendingTimingCount} 段时间，点击「${t('audioList.saveTooltip')}」`
                      : `Pending: ${pendingChangesCount} voice · ${pendingTimingCount} timing. Click “${t('audioList.saveTooltip')}”.`}
                  </span>
                </>
              ) : null}
            </div>

            {taskStatus === 'failed' && taskErrorMessage ? (
              <div className="mt-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                {taskErrorMessage}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Badge
            variant="outline"
            className="gap-1 border-white/10 bg-white/[0.03] text-muted-foreground"
            title={
              locale === 'zh'
                ? '当前剩余积分'
                : 'Remaining credits'
            }
          >
            <Zap className="h-3 w-3 text-primary" />
            {remainingCredits}
          </Badge>

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
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">
                    {locale === 'zh' ? '积分消耗说明' : 'Credit usage'}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {locale === 'zh' ? '剩余' : 'Remaining'}: {remainingCredits}
                  </div>
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
              </div>
            </PopoverContent>
          </Popover>

          <span
            className="inline-flex"
            title={
              pendingChangesCount + pendingTimingCount === 0
                ? (locale === 'zh' ? '没有待应用的改动' : 'No pending changes to apply')
                : t('audioList.saveTooltip')
            }
          >
            <Button
              size="sm"
              className="gap-2"
              onClick={handleGenerateVideo}
              disabled={isGeneratingVideo || pendingChangesCount + pendingTimingCount === 0}
            >
              {isGeneratingVideo ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
              ) : null}
              {t('audioList.saveTooltip')}
              {pendingChangesCount + pendingTimingCount > 0 ? (
                <span className="rounded-md bg-white/10 px-2 py-0.5 text-[11px] tabular-nums">
                  {pendingChangesCount + pendingTimingCount}
                </span>
              ) : null}
            </Button>
          </span>
        </div>

        {convertObj ? (
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-white/[0.04]">
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
            defaultLeftWidthPercent={62}
            minLeftWidthPercent={34}
            minRightWidthPercent={22}
            minRightWidthPx={360}
            leftPanel={
              <div className="h-full bg-background/20">
                <SubtitleWorkstation
                  ref={workstationRef}
                  convertObj={convertObj}
                  playingSubtitleIndex={playingSubtitleIndex}
                  onSeekToSubtitle={handleSeekToSubtitle}
                  onUpdateSubtitleAudioUrl={handleUpdateSubtitleAudio}
                  onPendingChangesChange={handlePendingChangesChange}
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
            'group relative h-3 shrink-0 cursor-row-resize select-none',
            'rounded-md bg-white/[0.02] hover:bg-white/[0.03]'
          )}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            const el = e.currentTarget as HTMLDivElement;
            const body = bodyRef.current;
            if (!body) return;

            const rect = body.getBoundingClientRect();
            // Keep workspace usable: reserve at least 240px.
            const maxHeight = Math.max(180, Math.min(520, Math.floor(rect.height - 240)));

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
            const next = Math.max(180, Math.min(st.maxHeight, Math.round(st.startHeight + dy)));
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
          <div aria-hidden className="absolute inset-x-2 top-1/2 h-px -translate-y-1/2 bg-white/10" />
          <div
            aria-hidden
            className={cn(
              'absolute left-1/2 top-1/2 h-1 w-10 -translate-x-1/2 -translate-y-1/2 rounded-full',
              'bg-white/10 group-hover:bg-primary/35'
            )}
          />
        </div>

        {/* Timeline */}
        <div
          className="min-h-[180px] overflow-hidden rounded-xl border border-white/10 bg-background/25 shadow-[0_18px_60px_rgba(0,0,0,0.35)]"
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
          />
        </div>
      </div>
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

function ErrorDisplay({ error }: { error: string }) {
  return (
    <div className="h-screen flex items-center justify-center text-destructive">
      <div className="p-6 border border-destructive/20 bg-destructive/5 rounded-xl">
        <h3 className="font-bold text-lg mb-2">Error Loading Editor</h3>
        <p>{error}</p>
      </div>
    </div>
  );
}
