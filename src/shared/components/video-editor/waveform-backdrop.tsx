'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/shared/lib/utils';
import { waveformLoadQueue } from '@/shared/lib/waveform/loader';

export type WaveformBackdropStatus = 'idle' | 'queued' | 'loading' | 'ready' | 'error';

type Tone = 'vocal' | 'bgm';

function toneColors(tone: Tone | undefined) {
  // Subtle, "tech-minimal" palette. Must stay behind the clips.
  if (tone === 'bgm') {
    return {
      wave: 'rgba(167, 139, 250, 0.30)', // violet
      progress: 'rgba(167, 139, 250, 0.18)',
    };
  }
  return {
    wave: 'rgba(14, 165, 233, 0.32)', // cyan
    progress: 'rgba(14, 165, 233, 0.16)',
  };
}

export function WaveformBackdrop({
  className,
  url,
  minPxPerSec,
  tone = 'vocal',
  onStatusChange,
}: {
  className?: string;
  url?: string | null;
  minPxPerSec: number;
  tone?: Tone;
  onStatusChange?: (s: WaveformBackdropStatus) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<any>(null);
  const [status, setStatus] = useState<WaveformBackdropStatus>('idle');

  const palette = useMemo(() => toneColors(tone), [tone]);
  const renderPxPerSec = useMemo(() => Math.max(1, Math.min(Math.round(minPxPerSec), 14)), [minPxPerSec]);
  const scaleX = useMemo(() => Math.max(1, minPxPerSec / renderPxPerSec), [minPxPerSec, renderPxPerSec]);

  // Create/destroy wavesurfer when url changes.
  useEffect(() => {
    const host = hostRef.current;
    const src = (url || '').trim();
    if (!host || !src) {
      setStatus('idle');
      onStatusChange?.('idle');
      return;
    }

    let destroyed = false;
    const controller = new AbortController();

    const cleanup = () => {
      controller.abort();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws && typeof ws.destroy === 'function') {
        try {
          ws.destroy();
        } catch {
          // ignore
        }
      }
    };

    const start = async (signal: AbortSignal) => {
      if (destroyed || signal.aborted) throw new DOMException('Aborted', 'AbortError');

      setStatus('loading');
      onStatusChange?.('loading');

      const mod = await import('wavesurfer.js');
      if (destroyed || signal.aborted) throw new DOMException('Aborted', 'AbortError');

      const WaveSurfer = mod.default;
      const ws = WaveSurfer.create({
        container: host,
        height: 'auto',
        waveColor: palette.wave,
        progressColor: palette.progress,
        cursorWidth: 0,
        interact: false,
        dragToSeek: false,
        hideScrollbar: true,
        normalize: true,
        minPxPerSec: renderPxPerSec,
        fillParent: false,
        backend: 'WebAudio',
      });

      wsRef.current = ws;

      ws.on('ready', () => {
        if (destroyed) return;
        setStatus('ready');
        onStatusChange?.('ready');
      });
      ws.on('error', () => {
        if (destroyed) return;
        setStatus('error');
        onStatusChange?.('error');
      });

      await ws.load(src);
    };

    // Lazy-init: only start once visible, never block editing.
    setStatus('queued');
    onStatusChange?.('queued');

    const enqueue = () => {
      void waveformLoadQueue.enqueue(start, controller.signal).catch((err) => {
        if (controller.signal.aborted) return;
        // Import/load failures may happen before wavesurfer can emit "error".
        setStatus('error');
        onStatusChange?.('error');
        console.error('[WaveformBackdrop] load failed:', err);
      });
    };

    let observer: IntersectionObserver | null = null;
    if (typeof IntersectionObserver !== 'undefined') {
      observer = new IntersectionObserver(
        (entries) => {
          const visible = entries.some((e) => e.isIntersecting);
          if (!visible) return;
          observer?.disconnect();
          enqueue();
        },
        { root: null, threshold: 0.12 }
      );
      observer.observe(host);
    } else {
      enqueue();
    }

    return () => {
      destroyed = true;
      observer?.disconnect();
      cleanup();
    };
  }, [onStatusChange, palette.progress, palette.wave, renderPxPerSec, url]);

  // Keep zoom in sync without reloading audio.
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    if (typeof ws.zoom !== 'function') return;
    try {
      ws.zoom(renderPxPerSec);
    } catch {
      // ignore
    }
  }, [renderPxPerSec]);

  return (
    <div className={cn('pointer-events-none absolute inset-0', className)}>
      {/* wavesurfer mounts canvases into this node */}
      <div
        className="absolute inset-0"
        style={{
          transformOrigin: '0 50%',
          transform: scaleX > 1 ? `scaleX(${scaleX})` : undefined,
          width: scaleX > 1 ? `${100 / scaleX}%` : undefined,
        }}
      >
        <div ref={hostRef} className="absolute inset-0 opacity-70" />
      </div>

      {/* Skeleton while queued/loading (keeps layout stable & reassures users). */}
      {status === 'queued' || status === 'loading' ? (
        <div
          aria-hidden
          className={cn(
            'absolute inset-0 opacity-70',
            '[mask-image:linear-gradient(to_right,transparent,black,transparent)] [mask-size:100%_100%] [mask-repeat:no-repeat]'
          )}
        >
          <div
            className={cn(
              'absolute inset-0',
              'bg-[linear-gradient(90deg,transparent,oklch(1_0_0_/_0.14),transparent)]',
              '[background-size:220%_100%]',
              'animate-shimmer motion-reduce:animate-none'
            )}
          />
          <div className="absolute inset-y-0 left-0 right-0 flex items-center">
            <div className="h-px w-full bg-white/10" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
