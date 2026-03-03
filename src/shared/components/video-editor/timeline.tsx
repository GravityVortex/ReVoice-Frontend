'use client';

import React, { useCallback, useMemo, useRef } from 'react';

import { cn } from '@/shared/lib/utils';

type TimelineProps = {
  className?: string;
  currentTime: number;
  totalDuration: number;
  zoom?: number;
  onTimeLineClick?: (time: number) => void;
  onTimeChange?: (time: number) => void;
  onDragging?: (dragging: boolean) => void;
  onDragStop?: (time: number) => void;
  playheadHeightPx?: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '00:00';
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const LABEL_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600] as const;
const MINOR_TICK_STEPS = [0.25, 0.5, 1, 1.5, 2, 2.5, 4, 5, 8, 10, 15, 30, 60, 120, 300, 600] as const;

function pickLabelStepSeconds(totalDuration: number, zoom: number) {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  // UX baseline: at 100% zoom we want a readable "2s per mark" ruler.
  // When zooming out, labels can be sparser; when zooming in, 1s labels are enough.
  const target = 2 / z;
  let best: number = LABEL_STEPS[0];
  let bestDelta = Math.abs(best - target);
  for (const step of LABEL_STEPS) {
    const d = Math.abs(step - target);
    if (d < bestDelta) {
      best = step;
      bestDelta = d;
    }
  }
  return best;
}

function pickMinorTickSeconds(zoom: number) {
  const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  const target = 2 / z; // default: 2s per tick at 100%
  let best: number = MINOR_TICK_STEPS[0];
  let bestDelta = Math.abs(best - target);
  for (const step of MINOR_TICK_STEPS) {
    const d = Math.abs(step - target);
    if (d < bestDelta) {
      best = step;
      bestDelta = d;
    }
  }
  return best;
}

export function Timeline({
  className,
  currentTime,
  totalDuration,
  zoom = 1,
  onTimeLineClick,
  onTimeChange,
  onDragging,
  onDragStop,
  playheadHeightPx,
}: TimelineProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef<number>(0);
  const didDragRef = useRef(false);

  // Throttle drag emits: this avoids turning pointermove into a full-react render loop.
  const lastEmitMsRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const latestTimeRef = useRef(0);

  const safeTotal = Math.max(0.001, totalDuration);

  // User expectation: keep the ruler readable and predictable.
  // Fixed tick grid: 0.5s per minor mark, 2s per major mark.
  // (Zoom changes the spacing in px, not the "seconds per tick".)
  const minorStepSeconds = 0.5;
  const majorStepSeconds = 2;
  // Labels are much more expensive than ticks; keep them sparse so playback doesn't stutter.
  // (Still consistent with a 2s grid: label every major mark.)
  const labelStepSeconds = 2;

  const minorStepPct = useMemo(() => Math.min(100, (minorStepSeconds / safeTotal) * 100), [minorStepSeconds, safeTotal]);
  const majorStepPct = useMemo(() => Math.min(100, (majorStepSeconds / safeTotal) * 100), [majorStepSeconds, safeTotal]);

  const labels = useMemo(() => {
    const out: Array<{ t: number; leftPct: number; label: string }> = [];
    const count = Math.floor(safeTotal / labelStepSeconds);
    for (let i = 0; i <= count; i++) {
      const t = i * labelStepSeconds;
      out.push({ t, leftPct: (t / safeTotal) * 100, label: formatTime(t) });
    }
    return out;
  }, [labelStepSeconds, safeTotal]);

  // Memoize the heavy label tree so `currentTime` updates mainly move the playhead.
  const labelEls = useMemo(() => {
    return labels.map((l) => (
      <div
        key={l.t}
        className="absolute -translate-x-1/2 text-[10px] font-mono tabular-nums text-muted-foreground/80"
        style={{ left: `${l.leftPct}%` }}
      >
        {l.label}
      </div>
    ));
  }, [labels]);

  const timeAtClientX = useCallback(
    (clientX: number) => {
      const el = rootRef.current;
      if (!el) return 0;
      const rect = el.getBoundingClientRect();
      const x = clamp(clientX - rect.left, 0, rect.width);
      const pct = rect.width <= 0 ? 0 : x / rect.width;
      return clamp(pct * safeTotal, 0, safeTotal);
    },
    [safeTotal]
  );

  const stopRaf = useCallback(() => {
    if (rafIdRef.current == null) return;
    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
  }, []);

  const scheduleDragEmit = useCallback(() => {
    if (rafIdRef.current != null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const now = performance.now();
      // 30fps feels smooth enough without hammering the whole editor.
      if (now - lastEmitMsRef.current < 1000 / 30) return;
      lastEmitMsRef.current = now;
      onTimeChange?.(latestTimeRef.current);
    });
  }, [onTimeChange]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      pointerIdRef.current = e.pointerId;
      startXRef.current = e.clientX;
      didDragRef.current = false;
      latestTimeRef.current = timeAtClientX(e.clientX);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [timeAtClientX]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (pointerIdRef.current == null || e.pointerId !== pointerIdRef.current) return;
      const dx = Math.abs(e.clientX - startXRef.current);
      latestTimeRef.current = timeAtClientX(e.clientX);

      if (!didDragRef.current && dx >= 3) {
        didDragRef.current = true;
        lastEmitMsRef.current = 0;
        onDragging?.(true);
        // Emit immediately so the UI "sticks" to the pointer.
        onTimeChange?.(latestTimeRef.current);
        return;
      }

      if (didDragRef.current) {
        scheduleDragEmit();
      }
    },
    [onDragging, onTimeChange, scheduleDragEmit, timeAtClientX]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (pointerIdRef.current == null || e.pointerId !== pointerIdRef.current) return;
      const time = timeAtClientX(e.clientX);
      stopRaf();
      pointerIdRef.current = null;

      if (didDragRef.current) {
        didDragRef.current = false;
        onDragging?.(false);
        onDragStop?.(time);
        return;
      }

      onTimeLineClick?.(time);
    },
    [onDragStop, onDragging, onTimeLineClick, stopRaf, timeAtClientX]
  );

  const handlePointerCancel = useCallback((e: React.PointerEvent) => {
    stopRaf();
    pointerIdRef.current = null;
    if (didDragRef.current) {
      didDragRef.current = false;
      onDragging?.(false);
      // Treat pointer-cancel like a drag-stop so parents can clear their "drag pause" flags.
      onDragStop?.(latestTimeRef.current);
    }
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, [onDragStop, onDragging, stopRaf]);

  const playheadLeftPct = useMemo(() => clamp((currentTime / safeTotal) * 100, 0, 100), [currentTime, safeTotal]);
  const playheadH = playheadHeightPx ?? undefined;

  return (
    <div
      ref={rootRef}
      className={cn(
        'relative h-full w-full select-none',
        // Grid ticks.
        '[background-image:linear-gradient(to_right,rgba(148,163,184,0.10)_1px,transparent_1px),linear-gradient(to_right,rgba(148,163,184,0.16)_1px,transparent_1px)]',
        className
      )}
      style={{
        backgroundSize: `${minorStepPct}% 100%, ${majorStepPct}% 100%`,
        backgroundRepeat: 'repeat',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {/* Labels */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-1">
        {labelEls}
      </div>

      {/* Playhead (pro-editor style: crisp line + compact handle; overflows downward into tracks). */}
      <div
        aria-hidden
        className={cn(
          'absolute top-0 z-30 w-px',
          'bg-primary',
          'shadow-[0_0_0_1px_rgba(0,0,0,0.55),0_0_14px_rgba(0,0,0,0.25)]'
        )}
        style={{
          left: `calc(${playheadLeftPct}% - 0.5px)`,
          height: playheadH ?? '100%',
        }}
      />
      <div aria-hidden className="absolute top-0 z-40 -translate-x-1/2" style={{ left: `${playheadLeftPct}%` }}>
        <div
          className={cn(
            'relative mt-1 h-4 w-6 rounded-[7px]',
            'bg-primary',
            'shadow-[0_10px_30px_rgba(0,0,0,0.35),0_0_0_1px_rgba(255,255,255,0.14)]'
          )}
        >
          {/* Grip */}
          <div className="absolute inset-x-1.5 top-1 h-[2px] rounded bg-white/25" />
          {/* Pointer */}
          <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-[7px] border-r-[7px] border-t-[8px] border-l-transparent border-r-transparent border-t-primary" />
        </div>
      </div>
    </div>
  );
}
