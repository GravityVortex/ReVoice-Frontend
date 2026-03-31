'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Music, Pause, Play, Scissors, Type, Undo2, Volume2, ZoomIn, ZoomOut } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@/shared/components/ui/button';
import { Slider } from '@/shared/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { SubtitleTrack } from '@/shared/components/video-editor/subtitle-track';
import { Timeline, type TimelineHandle } from '@/shared/components/video-editor/timeline';
import { SubtitleTrackItem } from '@/shared/components/video-editor/types';
import { WaveformBackdrop } from '@/shared/components/video-editor/waveform-backdrop';
import { getTimelineAutoFollowTarget } from '@/shared/lib/timeline/follow';
import { cn } from '@/shared/lib/utils';
import { audioMetaLoadQueue } from '@/shared/lib/waveform/loader';

import type { EditorTransportSnapshot } from './editor-transport';

export type { TimelineHandle };

interface TimelinePanelProps {
  className?: string;
  totalDuration: number;
  transportSnapshot: EditorTransportSnapshot;
  subtitleTrack: SubtitleTrackItem[];
  subtitleTrackOriginal?: SubtitleTrackItem[];
  vocalWaveformUrl?: string;
  bgmWaveformUrl?: string;
  timelineRef?: React.RefObject<TimelineHandle | null>;

  // State
  zoom: number;
  volume: number;
  isBgmMuted: boolean;
  isSubtitleMuted: boolean;

  // Actions
  onPlayPause: () => void;
  onSeek: (time: number, isDragging?: boolean) => void;
  onZoomChange: (zoom: number) => void;
  onVolumeChange: (volume: number) => void;
  onToggleBgmMute: () => void;
  onToggleSubtitleMute: () => void;
  onSplitAtCurrentTime?: () => void;
  splitDisabled?: boolean;
  splitTooltipText?: string | null;
  splitLoading?: boolean;
  onUndo?: () => void;
  undoDisabled?: boolean;
  undoLoading?: boolean;
  undoCountdown?: number;
  undoTooltipText?: string | null;
  onUndoCancel?: () => void;
}

function BufferingOrbitalDots({ label }: { label: string }) {
  return (
    <div className="relative h-4 w-4" aria-label={label} role="status">
      <div className="orbital absolute inset-0">
        {Array.from({ length: 6 }).map((_, i) => (
          <span
            key={i}
            className="dot bg-primary/90 absolute top-1/2 left-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              transform: `translate(-50%, -50%) rotate(${i * 60}deg) translateX(7px)`,
              animationDelay: `${i * 90}ms`,
            }}
          />
        ))}
      </div>
      <style jsx>{`
        .orbital {
          animation: orbit 1100ms linear infinite;
          will-change: transform;
        }
        .dot {
          animation: dotFade 1100ms ease-in-out infinite;
          filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.1));
        }
        @keyframes orbit {
          to {
            transform: rotate(360deg);
          }
        }
        @keyframes dotFade {
          0%,
          100% {
            opacity: 0.18;
          }
          40% {
            opacity: 1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .orbital,
          .dot {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}

export function TimelinePanel({
  className,
  totalDuration,
  transportSnapshot,
  subtitleTrack,
  subtitleTrackOriginal,
  vocalWaveformUrl,
  bgmWaveformUrl,
  timelineRef,
  zoom,
  volume,
  isBgmMuted,
  isSubtitleMuted,
  onPlayPause,
  onSeek,
  onZoomChange,
  onVolumeChange,
  onToggleBgmMute,
  onToggleSubtitleMute,
  onSplitAtCurrentTime,
  splitDisabled = false,
  splitLoading = false,
  onUndo,
  undoLoading = false,
  undoCountdown = 0,
  onUndoCancel,
}: TimelinePanelProps) {
  const t = useTranslations('video_convert.videoEditor.videoEditor');
  const locale = useLocale();
  const currentTime = transportSnapshot.currentTimeSec;
  const isPlaying = transportSnapshot.playbackStatus === 'playing';
  const isBuffering = transportSnapshot.playbackStatus === 'buffering';
  const playingSubtitleIndex = transportSnapshot.activeTimelineClipIndex;
  const blockingState = transportSnapshot.blockingState ?? null;
  const bufferingLabel = locale === 'zh' ? '缓冲中' : 'Buffering';
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const undoKey = isMac ? '⌘Z' : 'Ctrl+Z';

  // Waveform + metadata probing are CPU/network heavy and can cause audible stutter on playback,
  // especially on mobile. Keep them off unless explicitly needed.
  const enableWaveform = false;
  const enableAudioMeta = false;

  // Format time (MM:SS)
  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds)) return '00:00';
    const total = Math.max(0, seconds);
    const h = Math.floor(total / 3600);
    const mins = Math.floor(total / 60);
    const secs = Math.floor(total % 60);
    if (h > 0) {
      const mm = Math.floor((total % 3600) / 60);
      return `${h.toString().padStart(2, '0')}:${mm.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const maxTrackWidth = useMemo(() => {
    const ends = [
      ...subtitleTrack.map((item) => item.startTime + item.duration),
      ...(subtitleTrackOriginal ? subtitleTrackOriginal.map((item) => item.startTime + item.duration) : []),
    ];
    const maxContentTime = ends.length > 0 ? Math.max(...ends) : totalDuration;
    return Math.max(maxContentTime, totalDuration);
  }, [subtitleTrack, subtitleTrackOriginal, totalDuration]);

  // Baseline density: keep "100%" comfortable (users shouldn't have to zoom in immediately).
  const PX_PER_SECOND = 50;
  const minPxPerSec = useMemo(() => Math.max(1, Math.round(PX_PER_SECOND * zoom)), [zoom]);
  const contentWidthPx = useMemo(() => {
    if (!Number.isFinite(maxTrackWidth) || maxTrackWidth <= 0) return 1;
    return Math.max(1, Math.round(maxTrackWidth * PX_PER_SECOND * zoom));
  }, [maxTrackWidth, zoom]);

  const rulerHeight = 40;
  const subtitleConvertedRowHeight = 56; // h-14
  const subtitleOriginalRowHeight = subtitleTrackOriginal ? 40 : 0; // h-10
  const bgmRowHeight = bgmWaveformUrl ? 40 : 0; // h-10
  const playheadHeightPx = rulerHeight + subtitleConvertedRowHeight + subtitleOriginalRowHeight + bgmRowHeight;

  const bgmWaveformProxyUrl = useMemo(() => {
    const raw = (bgmWaveformUrl || '').trim();
    if (!raw) return '';

    // Signed private-bucket URLs often lack CORS headers for `fetch`/WebAudio decoding.
    // Proxying through our origin keeps waveform rendering stable without changing external services.
    if (/^https?:\/\//i.test(raw)) {
      return `/api/storage/proxy?src=${encodeURIComponent(raw)}`;
    }

    return raw;
  }, [bgmWaveformUrl]);

  const vocalWaveformProxyUrl = useMemo(() => {
    const raw = (vocalWaveformUrl || '').trim();
    if (!raw) return '';

    if (/^https?:\/\//i.test(raw)) {
      return `/api/storage/proxy?src=${encodeURIComponent(raw)}`;
    }

    return raw;
  }, [vocalWaveformUrl]);

  const vocalWaveform = useMemo(() => {
    if (!enableWaveform) return undefined;
    if (!vocalWaveformProxyUrl) return undefined;
    return { url: vocalWaveformProxyUrl, minPxPerSec, tone: 'vocal' as const };
  }, [enableWaveform, minPxPerSec, vocalWaveformProxyUrl]);

  const blockedConvertedItemId = useMemo(() => {
    if (!blockingState) return null;
    const entry = subtitleTrack[blockingState.clipIndex];
    return entry?.id ?? blockingState.subtitleId ?? null;
  }, [blockingState, subtitleTrack]);

  const blockedConvertedLabel = useMemo(() => {
    if (!blockingState) return null;
    switch (blockingState.kind) {
      case 'loading':
        return t('playbackGate.badge.loading');
      case 'retrying':
        return t('playbackGate.badge.retrying');
      case 'network_failed':
        return t('playbackGate.badge.networkFailed');
      case 'voice_unavailable':
        return t('playbackGate.badge.voiceUnavailable');
      default:
        return null;
    }
  }, [blockingState, t]);

  // --- Audio overrun markers (M4) ---
  const [audioDurationMsById, setAudioDurationMsById] = useState<Record<string, number>>({});
  const [isTimelineDragging, setIsTimelineDragging] = useState(false);
  const audioDurationRef = useRef<Record<string, number>>({});
  const audioUrlByIdRef = useRef<Record<string, string>>({});
  const inflightRef = useRef<Map<string, AbortController>>(new Map());
  const inflightUrlRef = useRef<Map<string, string>>(new Map());
  const subtitleTrackRef = useRef(subtitleTrack);
  const minPxPerSecRef = useRef(minPxPerSec);

  useEffect(() => {
    subtitleTrackRef.current = subtitleTrack;
  }, [subtitleTrack]);
  useEffect(() => {
    minPxPerSecRef.current = minPxPerSec;
  }, [minPxPerSec]);
  useEffect(() => {
    audioDurationRef.current = audioDurationMsById;
  }, [audioDurationMsById]);

  // Keep duration cache aligned with the current track (prune removed ids, invalidate on url change).
  useEffect(() => {
    const nextUrlById: Record<string, string> = {};
    const nextDuration: Record<string, number> = {};

    for (const item of subtitleTrack) {
      const id = item.id;
      const nextUrl = (item.audioUrl || '').trim();
      nextUrlById[id] = nextUrl;

      const prevUrl = audioUrlByIdRef.current[id];
      const prevMs = audioDurationRef.current[id];

      if (prevUrl && prevUrl === nextUrl && typeof prevMs === 'number' && Number.isFinite(prevMs)) {
        nextDuration[id] = prevMs;
      }
    }

    audioUrlByIdRef.current = nextUrlById;
    const prev = audioDurationRef.current;
    const prevKeys = Object.keys(prev);
    const nextKeys = Object.keys(nextDuration);
    let same = prevKeys.length === nextKeys.length;
    if (same) {
      for (const k of nextKeys) {
        if (prev[k] !== nextDuration[k]) {
          same = false;
          break;
        }
      }
    }
    if (!same) setAudioDurationMsById(nextDuration);

    // Abort inflight tasks for clips that no longer exist (or changed url).
    for (const [id, controller] of inflightRef.current) {
      const nextUrl = nextUrlById[id];
      const inflightUrl = inflightUrlRef.current.get(id);
      if (!nextUrl || !inflightUrl || nextUrl !== inflightUrl) {
        controller.abort();
        inflightRef.current.delete(id);
        inflightUrlRef.current.delete(id);
      }
    }
  }, [subtitleTrack]);

  const readDurationMs = useCallback(async (url: string, signal: AbortSignal) => {
    if (!url) throw new Error('missing url');
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    return await new Promise<number>((resolve, reject) => {
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.crossOrigin = 'anonymous';

      let settled = false;
      const cleanup = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeoutId);
        signal.removeEventListener('abort', onAbort);
        audio.removeEventListener('error', onError);
        audio.removeEventListener('loadedmetadata', onLoaded);
        try {
          audio.pause();
          audio.removeAttribute('src');
          audio.load();
        } catch {
          // ignore
        }
      };

      const onAbort = () => {
        cleanup();
        reject(new DOMException('Aborted', 'AbortError'));
      };
      const onError = () => {
        cleanup();
        reject(new Error('failed to load metadata'));
      };
      const onLoaded = () => {
        const d = audio.duration;
        cleanup();
        if (!Number.isFinite(d) || d <= 0) reject(new Error('invalid duration'));
        else resolve(Math.round(d * 1000));
      };

      const timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error('metadata timeout'));
      }, 6000);

      signal.addEventListener('abort', onAbort, { once: true });
      audio.addEventListener('error', onError, { once: true });
      audio.addEventListener('loadedmetadata', onLoaded, { once: true });

      audio.src = url;
      try {
        audio.load();
      } catch {
        // ignore
      }
    });
  }, []);

  const queueDurationLoad = useCallback(
    (id: string, url: string) => {
      const known = audioDurationRef.current[id];
      if (typeof known === 'number' && Number.isFinite(known)) return;
      if (inflightRef.current.has(id)) return;
      if (!url) return;

      const controller = new AbortController();
      inflightRef.current.set(id, controller);
      inflightUrlRef.current.set(id, url);

      void audioMetaLoadQueue
        .enqueue((signal) => readDurationMs(url, signal), controller.signal)
        .then((ms) => {
          if (controller.signal.aborted) return;
          setAudioDurationMsById((prev) => (prev[id] === ms ? prev : { ...prev, [id]: ms }));
        })
        .catch(() => {
          // Silent: metadata failures should never disrupt editing.
        })
        .finally(() => {
          inflightRef.current.delete(id);
          inflightUrlRef.current.delete(id);
        });
    },
    [readDurationMs]
  );

  useEffect(() => {
    if (!enableAudioMeta) return;
    const scroller = document.getElementById('unified-scroll-container');
    if (!scroller) return;

    let raf: number | null = null;
    const tick = () => {
      raf = null;

      const pxPerSec = minPxPerSecRef.current;
      const items = subtitleTrackRef.current;
      if (!items || items.length === 0) return;

      const visibleStart = Math.max(0, scroller.scrollLeft / pxPerSec - 1.5);
      const visibleEnd = (scroller.scrollLeft + scroller.clientWidth) / pxPerSec + 1.5;

      // Find first clip that could overlap visibleStart (items are chronological).
      let lo = 0;
      let hi = items.length - 1;
      let first = items.length;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const it = items[mid];
        const end = it.startTime + it.duration;
        if (end >= visibleStart) {
          first = mid;
          hi = mid - 1;
        } else {
          lo = mid + 1;
        }
      }

      for (let i = first; i < items.length; i += 1) {
        const it = items[i];
        if (it.startTime > visibleEnd) break;
        if (it.audioUrl) queueDurationLoad(it.id, it.audioUrl);
      }

      // Also prioritize the currently playing segment (even if off-screen).
      if (playingSubtitleIndex >= 0 && playingSubtitleIndex < items.length) {
        const it = items[playingSubtitleIndex];
        if (it?.audioUrl) queueDurationLoad(it.id, it.audioUrl);
      }
    };

    const onScroll = () => {
      if (raf != null) return;
      raf = window.requestAnimationFrame(tick);
    };

    scroller.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    return () => {
      scroller.removeEventListener('scroll', onScroll);
      if (raf != null) window.cancelAnimationFrame(raf);
      for (const controller of inflightRef.current.values()) controller.abort();
      inflightRef.current.clear();
    };
  }, [enableAudioMeta, playingSubtitleIndex, queueDurationLoad]);

  // Auto-follow: now driven imperatively from the parent's rAF loop via
  // onAutoFollow callback, removing the high-frequency useEffect(currentTime) cascade.
  // We keep a low-frequency fallback for when React state updates (e.g. subtitle index change).
  const lastAutoScrollTimeRef = useRef<number>(-1);
  const autoFollowRafRef = useRef<number | null>(null);
  const isTimelineDraggingRef = useRef(isTimelineDragging);
  isTimelineDraggingRef.current = isTimelineDragging;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const handleConvertedSegmentClick = useCallback(
    (time: number) => {
      onSeek(time, false);
    },
    [onSeek]
  );

  const handleOriginalSegmentClick = handleConvertedSegmentClick;

  return (
    <div className={cn('bg-background/60 flex h-full flex-col border-t border-white/10', className)}>
      {/* 1. Toolbar */}
      <div className="bg-card/25 flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onPlayPause}
            className={cn('h-7 w-7', isBuffering && 'cursor-wait')}
            aria-label={isPlaying ? t('tooltips.pause') : t('tooltips.play')}
          >
            {isBuffering ? (
              <BufferingOrbitalDots label={bufferingLabel} />
            ) : isPlaying ? (
              <Pause className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
          </Button>

          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {formatTime(currentTime)} / {formatTime(maxTrackWidth)}
          </span>

          <div className="bg-border/50 hidden h-4 w-px md:block" />

          <div className="hidden items-center gap-1.5 md:flex">
            <Volume2 className="text-muted-foreground h-3.5 w-3.5" />
            <Slider
              aria-label="Volume"
              value={[Math.round(volume)]}
              min={0}
              max={100}
              step={1}
              className="w-20"
              onValueChange={(v) => {
                const next = v?.[0];
                if (typeof next === 'number' && Number.isFinite(next)) onVolumeChange(next);
              }}
            />
          </div>

          <div className="bg-border/50 hidden h-4 w-px md:block" />

          <div className="hidden items-center gap-1 md:flex">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onToggleSubtitleMute}
                  className={cn(
                    'inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
                    'text-muted-foreground hover:text-foreground border-white/10 bg-white/[0.03] hover:bg-white/[0.06]',
                    isSubtitleMuted ? 'border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/15' : null
                  )}
                  aria-label={isSubtitleMuted ? t('tooltips.unmuteSubtitle') : t('tooltips.muteSubtitle')}
                >
                  <Type className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{isSubtitleMuted ? t('tooltips.unmuteSubtitle') : t('tooltips.muteSubtitle')}</TooltipContent>
            </Tooltip>

            {bgmWaveformUrl ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={onToggleBgmMute}
                    className={cn(
                      'inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors',
                      'text-muted-foreground hover:text-foreground border-white/10 bg-white/[0.03] hover:bg-white/[0.06]',
                      isBgmMuted ? 'border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/15' : null
                    )}
                    aria-label={isBgmMuted ? t('tooltips.unmuteBgm') : t('tooltips.muteBgm')}
                  >
                    <Music className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{isBgmMuted ? t('tooltips.unmuteBgm') : t('tooltips.muteBgm')}</TooltipContent>
              </Tooltip>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                onClick={onSplitAtCurrentTime}
                disabled={splitDisabled || splitLoading}
                className={cn(
                  'group relative h-7 rounded-md px-2.5 transition-all duration-200',
                  splitDisabled && !splitLoading
                    ? 'text-muted-foreground/50 border border-white/10 bg-white/5 opacity-60'
                    : 'border border-teal-400/40 bg-teal-400/10 text-teal-300 shadow-[0_0_16px_rgba(45,212,191,0.15)]',
                  !splitDisabled && !splitLoading
                    ? 'hover:border-teal-400/60 hover:bg-teal-400/15 hover:text-teal-200 hover:shadow-[0_0_20px_rgba(45,212,191,0.25)]'
                    : null,
                  splitLoading ? 'pointer-events-none cursor-wait border-teal-400/30 bg-teal-400/10 text-teal-300' : null
                )}
              >
                <span className="flex items-center gap-1.5 text-[11px] font-semibold">
                  {splitLoading ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                      <span>{locale === 'zh' ? '切割中…' : 'Splitting…'}</span>
                    </>
                  ) : (
                    <>
                      <Scissors className="h-3.5 w-3.5" />
                      <span>{t('tooltips.splitSubtitle')}</span>
                    </>
                  )}
                </span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{splitDisabled ? t('toast.splitNoClip') : t('tooltips.splitSubtitleWithUndo')}</TooltipContent>
          </Tooltip>

          {(onUndo || undoCountdown > 0) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  onClick={undoCountdown > 0 ? onUndoCancel : onUndo}
                  disabled={undoLoading}
                  className={cn(
                    'h-7 rounded-md px-2 transition-all duration-200',
                    undoCountdown > 0
                      ? 'border border-amber-400/50 bg-amber-500/10 text-amber-300 hover:border-amber-400/70 hover:bg-amber-500/15'
                      : 'text-muted-foreground border border-white/10 bg-white/5 hover:border-amber-400/30 hover:bg-amber-500/[0.08] hover:text-amber-200',
                    undoLoading ? 'pointer-events-none cursor-wait' : null
                  )}
                >
                  <span className="flex items-center gap-1.5 text-[11px] font-medium">
                    {undoLoading ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                        <span>{locale === 'zh' ? '恢复中…' : 'Restoring…'}</span>
                      </>
                    ) : undoCountdown > 0 ? (
                      <>
                        <span className="font-semibold tabular-nums">{undoCountdown}s</span>
                        <span>{locale === 'zh' ? '取消' : 'Cancel'}</span>
                      </>
                    ) : (
                      <>
                        <Undo2 className="h-3.5 w-3.5" />
                        <span className="hidden lg:inline">{t('toast.undo')}</span>
                      </>
                    )}
                  </span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {undoCountdown > 0
                  ? locale === 'zh'
                    ? '点击取消撤销'
                    : 'Click to cancel undo'
                  : `${t('tooltips.undoSplit')} (${undoKey})`}
              </TooltipContent>
            </Tooltip>
          )}

          <div className="h-4 w-px bg-white/10" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onZoomChange(Math.max(0.2, zoom - 0.2))}
                className="h-7 w-7 rounded-md border border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t('tooltips.zoomOut')}</TooltipContent>
          </Tooltip>
          <span className="text-muted-foreground/80 w-10 text-center font-mono text-[11px] tabular-nums">{Math.round(zoom * 100)}%</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onZoomChange(Math.min(5, zoom + 0.2))}
                className="h-7 w-7 rounded-md border border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">{t('tooltips.zoomIn')}</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* 2. Timeline Area */}
      <div className="relative flex flex-1 overflow-hidden">
        {/* Left Headers */}
        <div className="bg-muted/10 flex w-24 shrink-0 flex-col border-r border-white/10 md:w-32">
          <div className="text-muted-foreground flex h-8 items-center border-b border-white/10 px-3 text-[11px] font-medium">
            <span className="truncate tracking-widest uppercase opacity-80">Timeline</span>
          </div>

          {/* Track Headers */}
          <div className="flex flex-1 flex-col">
            <div className="bg-muted/5 flex h-12 items-center justify-between gap-2 border-b border-white/10 px-3">
              <div className="min-w-0">
                <div className="text-muted-foreground/90 truncate text-[11px] font-medium">{t('tracks.subtitleTranslated')}</div>
              </div>
              {isSubtitleMuted ? <span className="text-destructive/80 shrink-0 text-[10px] font-medium">{t('tooltips.mute')}</span> : null}
            </div>
            {subtitleTrackOriginal ? (
              <div className="flex h-12 items-center justify-between border-b border-white/10 px-3">
                <span className="text-muted-foreground/80 truncate text-[11px] font-medium">{t('tracks.subtitleOriginal')}</span>
                <span className="text-muted-foreground/60 shrink-0 text-[10px]">{t('tracks.reference')}</span>
              </div>
            ) : null}
            {bgmWaveformUrl ? (
              <div className="flex h-8 items-center justify-between gap-2 border-b border-white/10 px-3">
                <span className="text-muted-foreground/80 truncate text-[11px] font-medium">{t('tracks.bgm')}</span>
                {isBgmMuted ? <span className="text-destructive/80 shrink-0 text-[10px] font-medium">{t('tooltips.mute')}</span> : null}
              </div>
            ) : null}
            {/* Empty Space Filler */}
            <div className="bg-background/20 w-full flex-1" />
          </div>
        </div>

        {/* Right Scrollable Timeline */}
        <div id="unified-scroll-container" className="bg-muted/5 relative flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex h-full min-w-full flex-col" style={{ width: `${contentWidthPx}px` }}>
            {/* Ruler */}
            <div className="bg-background/80 sticky top-0 z-20 h-8 overflow-visible border-b border-white/10">
              <Timeline
                ref={timelineRef}
                currentTime={currentTime}
                totalDuration={maxTrackWidth}
                zoom={zoom}
                onTimeLineClick={(t) => onSeek(t, false)}
                onTimeChange={(t) => onSeek(t, true)}
                onDragging={setIsTimelineDragging}
                onDragStop={(t) => onSeek(t, false)}
                playheadHeightPx={playheadHeightPx}
              />
            </div>

            {/* Tracks */}
            <div className={cn('transition-all duration-300', isSubtitleMuted && 'opacity-50 grayscale')}>
              <SubtitleTrack
                className="bg-muted/5 h-12 border-b border-white/10"
                items={subtitleTrack}
                totalDuration={maxTrackWidth}
                playingIndex={playingSubtitleIndex}
                blockedItemId={blockedConvertedItemId}
                blockedState={blockingState?.kind ?? null}
                blockedLabel={blockedConvertedLabel}
                zoom={zoom}
                pxPerSec={minPxPerSec}
                variant="converted"
                onSegmentClick={handleConvertedSegmentClick}
                waveform={vocalWaveform}
                audioDurationMsById={enableAudioMeta ? audioDurationMsById : undefined}
              />
            </div>

            {subtitleTrackOriginal ? (
              <SubtitleTrack
                className="h-12 border-b border-white/10"
                items={subtitleTrackOriginal}
                totalDuration={maxTrackWidth}
                playingIndex={playingSubtitleIndex}
                zoom={zoom}
                pxPerSec={minPxPerSec}
                variant="original"
                onSegmentClick={handleOriginalSegmentClick}
              />
            ) : null}

            {bgmWaveformUrl ? (
              <div
                className={cn(
                  'bg-muted/10 group/bgm relative h-8 overflow-hidden border-b border-white/10 transition-all duration-300',
                  isBgmMuted && 'opacity-50 grayscale'
                )}
              >
                {/* Base Striped Block indicating track presence */}
                <div className="bg-primary/20 border-primary/30 shadow-primary/10 absolute inset-x-0 inset-y-[4px] overflow-hidden rounded-sm border shadow-sm">
                  {/* Subtle repeating stripe to look like a solid track */}
                  <div className="absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(255,255,255,0.05)_4px,rgba(255,255,255,0.05)_8px)]" />
                </div>

                {enableWaveform && bgmWaveformProxyUrl ? (
                  <WaveformBackdrop url={bgmWaveformProxyUrl} minPxPerSec={minPxPerSec} tone="bgm" className="relative z-10 opacity-90" />
                ) : null}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 z-20 bg-[linear-gradient(to_right,rgba(255,255,255,0.06),transparent,rgba(255,255,255,0.05))] opacity-20"
                />
              </div>
            ) : null}

            {/* Infinite Extension Workbench Pattern */}
            <div
              className="pointer-events-none w-full flex-1 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px]"
              aria-hidden
            />
          </div>
        </div>

      </div>
    </div>
  );
}
