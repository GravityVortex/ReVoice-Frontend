'use client';

import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';

import { cn } from '@/shared/lib/utils';

export type TimelineHandle = {
  setTime: (sec: number) => void;
  getRootElement: () => HTMLDivElement | null;
};

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

function _pickLabelStepSeconds(totalDuration: number, zoom: number) {
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

function _pickMinorTickSeconds(zoom: number) {
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

export const Timeline = forwardRef<TimelineHandle, TimelineProps>(function Timeline({
  className,
  currentTime,
  totalDuration,
  zoom: _zoom = 1,
  onTimeLineClick,
  onTimeChange,
  onDragging,
  onDragStop,
  playheadHeightPx,
}, ref) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef<number>(0);
  const didDragRef = useRef(false);

  const glowRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);

  const rafIdRef = useRef<number | null>(null);
  const latestTimeRef = useRef(0);
  const [dragPreviewTime, setDragPreviewTime] = useState<number | null>(null);

  const safeTotal = Math.max(0.001, totalDuration);

  const safeTotalRef = useRef(safeTotal);
  safeTotalRef.current = safeTotal;

  useImperativeHandle(ref, () => ({
    setTime(sec: number) {
      const el = rootRef.current;
      if (!el) return;
      const total = safeTotalRef.current;
      const pct = clamp(sec / total, 0, 1);
      const px = pct * el.clientWidth;
      const tx = `translateX(${px}px)`;
      if (glowRef.current) glowRef.current.style.transform = tx;
      if (lineRef.current) lineRef.current.style.transform = tx;
      if (headRef.current) headRef.current.style.transform = tx;
    },
    getRootElement() {
      return rootRef.current;
    },
  }), []);

  // User expectation: keep the ruler readable and predictable.
  // Fixed tick grid: 0.5s per minor mark, 2s per major mark.
  // (Zoom changes the spacing in px, not the "seconds per tick".)
  const minorStepSeconds = 0.25;
  const majorStepSeconds = 1;
  // Labels are much more expensive than ticks; keep them sparse so playback doesn't stutter.
  const labelStepSeconds = 1;

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
      setDragPreviewTime(latestTimeRef.current);
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [timeAtClientX]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (pointerIdRef.current == null || e.pointerId !== pointerIdRef.current) return;
      const dx = Math.abs(e.clientX - startXRef.current);
      latestTimeRef.current = timeAtClientX(e.clientX);
      setDragPreviewTime(latestTimeRef.current);

      if (!didDragRef.current && dx >= 3) {
        didDragRef.current = true;
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
      setDragPreviewTime(null);

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
    setDragPreviewTime(null);
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

  const playheadH = playheadHeightPx ?? undefined;

  // During drag, use React state for preview; otherwise fall back to the
  // imperative ref path (which is driven externally at 60fps).
  // We still compute an initial CSS position from currentTime so the playhead
  // appears correctly on mount / when not being driven imperatively.
  const playheadTime = dragPreviewTime ?? currentTime;
  const playheadPx = useMemo(() => {
    const el = rootRef.current;
    if (el) return clamp(playheadTime / safeTotal, 0, 1) * el.clientWidth;
    return 0;
  }, [playheadTime, safeTotal]);

  // Sync imperative refs when React-driven position changes (drag preview, seek).
  const syncPlayheadRefs = useCallback((px: number) => {
    const tx = `translateX(${px}px)`;
    if (glowRef.current) glowRef.current.style.transform = tx;
    if (lineRef.current) lineRef.current.style.transform = tx;
    if (headRef.current) headRef.current.style.transform = tx;
  }, []);

  // When drag preview or initial mount, push to refs too.
  const prevSyncPx = useRef<number>(-1);
  if (playheadPx !== prevSyncPx.current) {
    prevSyncPx.current = playheadPx;
    syncPlayheadRefs(playheadPx);
  }

  return (
    <div
      ref={rootRef}
      className={cn(
        'relative h-full w-full select-none',
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

      {/* Playhead glow */}
      <div
        ref={glowRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-30 w-[10px] -translate-x-1/2 rounded-full bg-primary/20 blur-[8px]"
        style={{
          height: playheadH ?? '100%',
          willChange: 'transform',
        }}
      />
      {/* Playhead line */}
      <div
        ref={lineRef}
        aria-hidden
        className={cn(
          'pointer-events-none absolute left-0 top-0 z-40 w-[2px] -translate-x-1/2 rounded-full',
          'bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(196,181,253,0.92)_18%,rgba(168,85,247,0.95)_48%,rgba(34,211,238,0.9)_100%)]',
          'shadow-[0_0_0_1px_rgba(255,255,255,0.22),0_0_18px_rgba(168,85,247,0.45),0_0_34px_rgba(34,211,238,0.25)]'
        )}
        style={{
          height: playheadH ?? '100%',
          willChange: 'transform',
        }}
      />
      {/* Playhead handle */}
      <div
        ref={headRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-50 -translate-x-1/2"
        style={{ willChange: 'transform' }}
      >
        <div
          className={cn(
            'relative mt-1 flex h-5 min-w-[30px] items-center justify-center rounded-[9px] px-2.5',
            'bg-[linear-gradient(135deg,rgba(168,85,247,0.98),rgba(76,29,149,0.94))]',
            'shadow-[0_12px_32px_rgba(0,0,0,0.4),0_0_0_1px_rgba(255,255,255,0.22),0_0_18px_rgba(168,85,247,0.42)]'
          )}
        >
          <div className="absolute inset-x-2 top-1 h-[2px] rounded bg-white/35" />
          <div className="absolute inset-x-[9px] bottom-1 h-[2px] rounded bg-cyan-300/35" />
          <div className="h-[2px] w-3 rounded-full bg-white/55" />
          <div className="absolute left-1/2 top-full h-0 w-0 -translate-x-1/2 border-l-[8px] border-r-[8px] border-t-[10px] border-l-transparent border-r-transparent border-t-[rgba(124,58,237,0.96)]" />
        </div>
      </div>
    </div>
  );
});
