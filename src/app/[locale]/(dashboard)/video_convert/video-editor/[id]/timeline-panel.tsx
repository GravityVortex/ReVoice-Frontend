'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/components/ui/button';
import { Pause, Play, Volume2, ZoomIn, ZoomOut } from 'lucide-react';
import { Slider } from '@/shared/components/ui/slider';
import { Timeline } from '@/shared/components/video-editor/timeline';
import { SubtitleTrack } from '@/shared/components/video-editor/subtitle-track';
import { SubtitleTrackItem } from '@/shared/components/video-editor/types';
import { useLocale, useTranslations } from 'next-intl';
import { audioMetaLoadQueue } from '@/shared/lib/waveform/loader';
import { WaveformBackdrop } from '@/shared/components/video-editor/waveform-backdrop';

interface TimelinePanelProps {
    className?: string;
    totalDuration: number;
    currentTime: number;
    isPlaying: boolean;
    isBuffering?: boolean;
    playingSubtitleIndex?: number;
    subtitleTrack: SubtitleTrackItem[];
    subtitleTrackOriginal?: SubtitleTrackItem[];
    onSubtitleTrackChange?: (nextTrack: SubtitleTrackItem[]) => void;
    vocalWaveformUrl?: string;
    bgmWaveformUrl?: string;

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
}

function BufferingOrbitalDots({ label }: { label: string }) {
    return (
        <div className="relative h-4 w-4" aria-label={label} role="status">
            <div className="orbital absolute inset-0">
                {Array.from({ length: 6 }).map((_, i) => (
                    <span
                        key={i}
                        className="dot absolute left-1/2 top-1/2 h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/90"
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
                    filter: drop-shadow(0 0 6px rgba(14, 165, 233, 0.25));
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
    currentTime,
    isPlaying,
    isBuffering = false,
    playingSubtitleIndex = -1,
    subtitleTrack,
    subtitleTrackOriginal,
    onSubtitleTrackChange,
    vocalWaveformUrl,
    bgmWaveformUrl,
    zoom,
    volume,
    isBgmMuted,
    isSubtitleMuted,
    onPlayPause,
    onSeek,
    onZoomChange,
    onVolumeChange,
    onToggleBgmMute,
    onToggleSubtitleMute
}: TimelinePanelProps) {
    const t = useTranslations('video_convert.videoEditor.videoEditor');
    const locale = useLocale();
    const bufferingLabel = locale === 'zh' ? '缓冲中' : 'Buffering';

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
            ...subtitleTrack.map(item => item.startTime + item.duration),
            ...(subtitleTrackOriginal ? subtitleTrackOriginal.map(item => item.startTime + item.duration) : []),
        ];
        const maxContentTime = ends.length > 0 ? Math.max(...ends) : totalDuration;
        return Math.max(maxContentTime, totalDuration);
    }, [subtitleTrack, subtitleTrackOriginal, totalDuration]);

    // Baseline density: keep "100%" comfortable (users shouldn't have to zoom in immediately).
    const PX_PER_SECOND = 22;
    const minPxPerSec = useMemo(() => Math.max(1, Math.round(PX_PER_SECOND * zoom)), [zoom]);
    const contentWidthPx = useMemo(() => {
        if (!Number.isFinite(maxTrackWidth) || maxTrackWidth <= 0) return 1;
        return Math.max(1, Math.round(maxTrackWidth * PX_PER_SECOND * zoom));
    }, [maxTrackWidth, zoom]);

    const rulerHeight = 40;
    const subtitleConvertedRowHeight = 64;
    const subtitleOriginalRowHeight = subtitleTrackOriginal ? 64 : 0;
    const bgmRowHeight = bgmWaveformUrl ? 64 : 0;
    const playheadHeightPx =
        rulerHeight +
        subtitleConvertedRowHeight +
        subtitleOriginalRowHeight +
        bgmRowHeight;

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

    // --- Audio overrun markers (M4) ---
    const [audioDurationMsById, setAudioDurationMsById] = useState<Record<string, number>>({});
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

    const queueDurationLoad = useCallback((id: string, url: string) => {
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
    }, [readDurationMs]);

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

    const handleConvertedSegmentClick = useCallback(
        (time: number) => {
            onSeek(time, false);
        },
        [onSeek]
    );

    const handleOriginalSegmentClick = handleConvertedSegmentClick;

            return (
        <div className={cn("flex flex-col bg-background/60 border-t border-white/10 h-full", className)}>
            {/* 1. Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-white/10 bg-card/25 shrink-0">
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onPlayPause}
                            className={cn("h-8 w-8", isBuffering && "cursor-wait")}
                            title={isBuffering ? bufferingLabel : undefined}
                        >
                            {isBuffering ? (
                                <BufferingOrbitalDots label={bufferingLabel} />
                            ) : isPlaying ? (
                                <Pause className="h-4 w-4" />
                            ) : (
                                <Play className="h-4 w-4" />
                            )}
                        </Button>
                    </div>

                    <div className="h-4 w-px bg-border/50" />

                    <div className="flex items-center gap-2">
                        <span className="text-xs font-mono tabular-nums text-muted-foreground">
                            {formatTime(currentTime)} / {formatTime(maxTrackWidth)}
                        </span>
                    </div>

                    {/* Volume */}
                    <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                            <Volume2 className="h-4 w-4 text-muted-foreground" />
                            <span className="w-10 text-right text-xs font-mono tabular-nums text-muted-foreground">
                                {Math.round(volume)}%
                            </span>
                        </div>
                        <Slider
                            aria-label="Volume"
                            value={[Math.round(volume)]}
                            min={0}
                            max={100}
                            step={1}
                            className="w-28 md:w-44"
                            onValueChange={(v) => {
                                const next = v?.[0];
                                if (typeof next === 'number' && Number.isFinite(next)) onVolumeChange(next);
                            }}
                        />
                    </div>

                    {/* Mute controls (no switches; clear tap targets). */}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onToggleSubtitleMute}
                            className={cn(
                                'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] transition-colors',
                                'border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground',
                                isSubtitleMuted ? 'border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/15' : null
                            )}
                            title={isSubtitleMuted ? t('tooltips.unmute') : t('tooltips.mute')}
                            aria-label={isSubtitleMuted ? t('tooltips.unmute') : t('tooltips.mute')}
                        >
                            <span className="font-medium">{t('tracks.subtitleTranslated')}</span>
                            <span className="text-muted-foreground/50">·</span>
                            <span className="tabular-nums">{isSubtitleMuted ? t('tooltips.unmute') : t('tooltips.mute')}</span>
                        </button>

                        {bgmWaveformUrl ? (
                            <button
                                type="button"
                                onClick={onToggleBgmMute}
                                className={cn(
                                    'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] transition-colors',
                                    'border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground',
                                    isBgmMuted ? 'border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/15' : null
                                )}
                                title={isBgmMuted ? t('tooltips.unmute') : t('tooltips.mute')}
                                aria-label={isBgmMuted ? t('tooltips.unmute') : t('tooltips.mute')}
                            >
                                <span className="font-medium">{t('tracks.bgm')}</span>
                                <span className="text-muted-foreground/50">·</span>
                                <span className="tabular-nums">{isBgmMuted ? t('tooltips.unmute') : t('tooltips.mute')}</span>
                            </button>
                        ) : null}
                    </div>

                </div>

                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => onZoomChange(Math.max(0.2, zoom - 0.2))} className="h-8 w-8">
                        <ZoomOut className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground w-10 text-center">{Math.round(zoom * 100)}%</span>
                    <Button variant="ghost" size="icon" onClick={() => onZoomChange(Math.min(5, zoom + 0.2))} className="h-8 w-8">
                        <ZoomIn className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* 2. Timeline Area */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left Headers */}
                <div className="w-28 md:w-36 border-r border-white/10 bg-muted/10 flex flex-col shrink-0">
                    <div className="h-10 border-b border-white/10 flex items-center px-4 text-xs font-medium text-muted-foreground">
                        <span className="truncate uppercase tracking-widest opacity-80">Timeline</span>
                    </div>

                    {/* Track Headers */}
                    <div className="flex-1 flex flex-col">
                        <div className="h-16 border-b border-white/10 flex items-center justify-between gap-2 px-3">
                            <div className="min-w-0">
                                <div className="truncate text-xs font-medium text-muted-foreground">
                                    {t('tracks.subtitleTranslated')}
                                </div>
                                <div className="mt-0.5 text-[10px] text-muted-foreground/55">
                                    {t('tracks.subtitle')}
                                </div>
                            </div>
                            {isSubtitleMuted ? (
                                <span className="text-[10px] font-medium text-destructive/80">
                                    {t('tooltips.mute')}
                                </span>
                            ) : null}
                        </div>
                        {subtitleTrackOriginal ? (
                            <div className="h-16 border-b border-white/10 flex items-center justify-between px-3">
                                <span className="truncate text-xs font-medium text-muted-foreground">
                                    {t('tracks.subtitleOriginal')}
                                </span>
                                <span className="text-[11px] text-muted-foreground/70">
                                    {t('tracks.reference')}
                                </span>
                            </div>
                        ) : null}
                        {bgmWaveformUrl ? (
                            <div className="h-16 border-b border-white/10 flex items-center justify-between gap-2 px-3">
                                <span className="truncate text-xs font-medium text-muted-foreground">
                                    {t('tracks.bgm')}
                                </span>
                                {isBgmMuted ? (
                                    <span className="text-[10px] font-medium text-destructive/80">
                                        {t('tooltips.mute')}
                                    </span>
                                ) : null}
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* Right Scrollable Timeline */}
                <div
                    id="unified-scroll-container"
                    className="group flex-1 overflow-x-auto overflow-y-hidden relative bg-muted/5"
                >
                    {/* Edge fades to hint horizontal scroll */}
                    <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 z-30 w-10 bg-gradient-to-r from-background/80 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
                    <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 z-30 w-10 bg-gradient-to-l from-background/80 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                    <div
                        className="flex flex-col h-full min-w-full"
                        style={{ width: `${contentWidthPx}px` }}
                    >

                        {/* Ruler */}
                        <div className="h-10 border-b border-white/10 sticky top-0 bg-background/80 z-20 overflow-visible">
                            <Timeline
                                currentTime={currentTime}
                                totalDuration={maxTrackWidth}
                                zoom={zoom}
                                onTimeLineClick={(t) => onSeek(t, false)}
                                onTimeChange={(t) => onSeek(t, true)}
                                onDragStop={(t) => onSeek(t, false)}
                                playheadHeightPx={playheadHeightPx}
                            />
                        </div>

                        {/* Tracks */}
	                        <SubtitleTrack
	                            className="h-16 border-b border-white/10"
	                            items={subtitleTrack}
	                            totalDuration={maxTrackWidth}
	                            playingIndex={playingSubtitleIndex}
	                            zoom={zoom}
	                            variant="converted"
	                            onItemsChange={onSubtitleTrackChange}
	                            onSegmentClick={handleConvertedSegmentClick}
	                            waveform={vocalWaveform}
	                            audioDurationMsById={enableAudioMeta ? audioDurationMsById : undefined}
	                        />

                        {subtitleTrackOriginal ? (
                            <SubtitleTrack
                                className="h-16 border-b border-white/10"
                                items={subtitleTrackOriginal}
                                totalDuration={maxTrackWidth}
                                playingIndex={playingSubtitleIndex}
                                zoom={zoom}
                                variant="original"
                                onSegmentClick={handleOriginalSegmentClick}
                            />
                        ) : null}

	                        {bgmWaveformUrl ? (
	                            <div className="relative h-16 border-b border-white/10 bg-muted/10">
	                                {enableWaveform && bgmWaveformProxyUrl ? (
	                                    <WaveformBackdrop
	                                        url={bgmWaveformProxyUrl}
	                                        minPxPerSec={minPxPerSec}
	                                        tone="bgm"
	                                        className="opacity-90"
	                                    />
	                                ) : null}
                                <div aria-hidden className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06),transparent,rgba(255,255,255,0.05))] opacity-20" />
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}
