"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Scissors } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { SubtitleTrackItem } from './types';
import { moveClipNoOverlap } from '@/shared/lib/timeline/collision';
import { WaveformBackdrop, type WaveformBackdropStatus } from './waveform-backdrop';

interface SubtitleTrackProps {
  items: SubtitleTrackItem[];
  onAddItem?: () => void;
  totalDuration: number;
  currentTime?: number;
  zoom?: number;
  selectedItem?: string;
  onSelectItem?: (id: string) => void;
  onSegmentClick?: (time: number) => void;
  onUpdateItem?: (id: string, updates: Partial<SubtitleTrackItem>) => void;
  onItemsChange?: (nextItems: SubtitleTrackItem[]) => void;
  onDeleteItem?: (id: string) => void;
  className?: string;
  playingIndex?: number; // 正在播放的字幕索引
  variant?: 'converted' | 'original';

  // Enhancements (must never block editing)
  waveform?: {
    url: string;
    minPxPerSec: number;
    tone?: 'vocal' | 'bgm';
    onStatusChange?: (s: WaveformBackdropStatus) => void;
  };
  audioDurationMsById?: Record<string, number | undefined>;
  audioOverrunToleranceMs?: number;
}

export const SubtitleTrack = memo(function SubtitleTrack({
  items,
  totalDuration,
  currentTime,
  zoom: _zoom = 1,
  selectedItem,
  onSelectItem,
  onSegmentClick,
  onItemsChange,
  className,
  playingIndex = -1,
  variant = 'converted',
  waveform,
  audioDurationMsById,
  audioOverrunToleranceMs = 80,
}: SubtitleTrackProps) {
  const safeTotalDuration = Math.max(0.001, totalDuration);
  const canEdit = typeof onItemsChange === 'function';

  const rootRef = useRef<HTMLDivElement>(null);
  const collisionRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const activeDragRef = useRef<{
    pointerId: number;
    clipId: string;
    clipIndex: number;
    baseStartTime: number;
    duration: number;
    startClientX: number;
    trackWidthPx: number;
    secPerPx: number;
    prevEnd: number;
    nextStart: number | null;
    maxStartVideo: number;
    didDrag: boolean;
    latestStartTime: number;
    latestWantsRipple: boolean;
    blockedByNext: boolean;
    showRippleHint: boolean;
    el: HTMLElement;
  } | null>(null);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [rippleHint, setRippleHint] = useState<{ id: string } | null>(null);
  const [hoveredSplitOpId, setHoveredSplitOpId] = useState<string | null>(null);

  // Cleanup in case the component unmounts mid-drag.
  useEffect(() => {
    return () => {
      if (rafIdRef.current != null) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
      activeDragRef.current = null;
    };
  }, []);

  const scheduleDragVisual = useCallback(() => {
    if (rafIdRef.current != null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const st = activeDragRef.current;
      if (!st) return;

      const left0 = (st.baseStartTime / safeTotalDuration) * st.trackWidthPx;
      const left1 = (st.latestStartTime / safeTotalDuration) * st.trackWidthPx;
      const dx = left1 - left0;
      st.el.style.transform = `translate3d(${dx}px, 0, 0)`;

      const collisionEl = collisionRef.current;
      if (collisionEl) {
        const nextStart = st.nextStart;
        const show = st.blockedByNext && !st.latestWantsRipple && nextStart != null;
        if (show && nextStart != null) {
          collisionEl.style.opacity = '1';
          collisionEl.style.left = `${(nextStart / safeTotalDuration) * 100}%`;
        } else {
          collisionEl.style.opacity = '0';
        }
      }
    });
  }, [safeTotalDuration]);

  const endDrag = useCallback(() => {
    const st = activeDragRef.current;
    activeDragRef.current = null;
    if (!st) return;
    try {
      st.el.releasePointerCapture(st.pointerId);
    } catch {
      // ignore
    }
    st.el.style.transform = '';
    st.el.style.willChange = '';
    st.el.style.cursor = '';
    setDraggingId(null);
    const collisionEl = collisionRef.current;
    if (collisionEl) collisionEl.style.opacity = '0';
  }, []);

  // Match the ruler: fixed, predictable grid (2s minor / 10s major).
  const minorStepSeconds = 2;
  const majorStepSeconds = 10;
  const minorStepPct = Math.min(100, (minorStepSeconds / safeTotalDuration) * 100);
  const majorStepPct = Math.min(100, (majorStepSeconds / safeTotalDuration) * 100);

  // 构建 splitOperationId → 相邻子段之间的分割点位置（用于渲染剪刀图标）
  const splitScissorPositions = useMemo(() => {
    const result: Array<{ leftPct: number; opId: string }> = [];
    for (let i = 0; i + 1 < items.length; i++) {
      const a = items[i];
      const b = items[i + 1];
      if (
        a.splitOperationId &&
        b.splitOperationId &&
        a.splitOperationId === b.splitOperationId
      ) {
        const boundaryTime = a.startTime + a.duration;
        result.push({
          leftPct: (boundaryTime / safeTotalDuration) * 100,
          opId: a.splitOperationId,
        });
      }
    }
    return result;
  }, [items, safeTotalDuration]);

  const baseColors =
    variant === 'original'
      ? 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]'
      : 'border-primary/20 bg-primary/12 hover:bg-primary/18';

  return (
    <div
      ref={rootRef}
      className={cn(
        'relative h-16 overflow-hidden bg-muted/20',
        className
      )}
    >
      {waveform?.url ? (
        <WaveformBackdrop
          url={waveform.url}
          minPxPerSec={waveform.minPxPerSec}
          tone={waveform.tone}
          onStatusChange={waveform.onStatusChange}
          className="opacity-90"
        />
      ) : null}

      {/* Collision indicator (only when clamped against the next clip). */}
      <div
        ref={collisionRef}
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-y-2 z-30 w-px',
          'bg-destructive/70 shadow-[0_0_0_1px_rgba(0,0,0,0.4)]',
          'opacity-0 transition-opacity duration-150'
        )}
        style={{ left: '0%' }}
      />

      {/* Grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-45"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(148, 163, 184, 0.12) 1px, transparent 1px), linear-gradient(to right, rgba(148, 163, 184, 0.18) 1px, transparent 1px)',
          backgroundSize: `${minorStepPct}% 100%, ${majorStepPct}% 100%`,
          backgroundRepeat: 'repeat',
        }}
      />

      {/* Items */}
      {items.map((item, index) => {
        const leftPercent = (item.startTime / safeTotalDuration) * 100;
        const widthPercent = (item.duration / safeTotalDuration) * 100;
        const isSelected = selectedItem === item.id;
        const isPlaying = playingIndex === index;
        const isAtPlayhead = typeof currentTime === 'number' && currentTime >= item.startTime && currentTime < item.startTime + item.duration;
        const isDragging = draggingId === item.id;
        const audioMs = audioDurationMsById?.[item.id];
        const windowMs = Math.max(0, Math.round(item.duration * 1000));
        const isOverrun =
          typeof audioMs === 'number' &&
          Number.isFinite(audioMs) &&
          audioMs > windowMs + audioOverrunToleranceMs;

        const isSplitItem = variant === 'converted' && Boolean(item.splitOperationId);
        const isSplitSiblingHovered = isSplitItem && hoveredSplitOpId === item.splitOperationId;

        // split 子段用 teal 色系，普通子段用原有色系
        const itemBaseColors = isSplitItem
          ? 'border-teal-400/20 bg-teal-400/8 hover:bg-teal-400/12'
          : baseColors;

        return (
          <div
            key={item.id}
            className={cn(
              'absolute top-2.5 h-11 rounded-md cursor-pointer border px-2.5',
              'transition-[background-color,border-color,box-shadow] duration-150',
              itemBaseColors,
              isPlaying
                ? isSplitItem
                  ? 'bg-teal-400/20 border-teal-400/50 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_10px_30px_rgba(45,212,191,0.2)]'
                  : 'bg-primary/20 border-primary/45 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_10px_30px_rgba(76,29,149,0.28)]'
                : null,
              isAtPlayhead
                ? isSplitItem
                  ? 'border-teal-400/70 ring-1 ring-teal-400/35 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_28px_rgba(45,212,191,0.18)]'
                  : 'border-primary/70 ring-1 ring-primary/35 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_28px_rgba(168,85,247,0.18)]'
                : null,
              isSelected
                ? isSplitItem
                  ? 'border-teal-400/55 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]'
                  : 'border-primary/55 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]'
                : null,
              // 同组 sibling hover 联动
              isSplitSiblingHovered && !isSelected && !isAtPlayhead
                ? 'ring-1 ring-teal-400/25'
                : null,
              isDragging ? 'z-40 cursor-grabbing ring-1 ring-primary/40 shadow-[0_18px_40px_rgba(0,0,0,0.35)]' : null
            )}
            style={{
              left: `calc(${leftPercent}% + 1px)`,
              width: `calc(${Math.max(widthPercent, 0.5)}% - 1px)`,
              minWidth: '18px',
            }}
            title={[
              `${item.text} (${item.startTime.toFixed(1)}s - ${(item.startTime + item.duration).toFixed(1)}s)`,
              isOverrun
                ? `Overrun / 超窗: audio ${(audioMs! / 1000).toFixed(2)}s > window ${(windowMs / 1000).toFixed(2)}s. Tip: extend this clip or hold Shift to ripple.`
                : null,
            ]
              .filter(Boolean)
              .join('\n')}
            onPointerEnter={() => {
              if (isSplitItem && item.splitOperationId) {
                setHoveredSplitOpId(item.splitOperationId);
              }
            }}
            onPointerLeave={() => {
              if (isSplitItem) setHoveredSplitOpId(null);
            }}
            onPointerDown={(e) => {
              if (!canEdit) return;
              if (e.button !== 0) return;

              const el = e.currentTarget as HTMLElement;
              const trackEl = rootRef.current;
              if (!trackEl) return;

              const rect = trackEl.getBoundingClientRect();
              const trackWidthPx = Math.max(1, rect.width);
              const secPerPx = safeTotalDuration / trackWidthPx;
              const prev = index > 0 ? items[index - 1] : null;
              const next = index + 1 < items.length ? items[index + 1] : null;
              const prevEnd = prev ? prev.startTime + prev.duration : 0;
              const maxStartVideo = Math.max(0, safeTotalDuration - item.duration);

              activeDragRef.current = {
                pointerId: e.pointerId,
                clipId: item.id,
                clipIndex: index,
                baseStartTime: item.startTime,
                duration: item.duration,
                startClientX: e.clientX,
                trackWidthPx,
                secPerPx,
                prevEnd,
                nextStart: next ? next.startTime : null,
                maxStartVideo,
                didDrag: false,
                latestStartTime: item.startTime,
                latestWantsRipple: false,
                blockedByNext: false,
                showRippleHint: false,
                el,
              };

              el.setPointerCapture(e.pointerId);
              el.style.willChange = 'transform';
              el.style.cursor = 'grabbing';
              setDraggingId(item.id);
            }}
            onPointerMove={(e) => {
              const st = activeDragRef.current;
              if (!st || e.pointerId !== st.pointerId) return;
              const dx = e.clientX - st.startClientX;
              if (!st.didDrag && Math.abs(dx) >= 3) st.didDrag = true;
              if (!st.didDrag) return;

              const wantsRipple = e.shiftKey === true;
              let candidateStart = st.baseStartTime + dx * st.secPerPx;
              candidateStart = Math.max(0, Math.min(candidateStart, st.maxStartVideo));

              const nextStart = st.nextStart;
              const maxStartClamp = nextStart == null ? st.maxStartVideo : Math.min(st.maxStartVideo, nextStart - st.duration);
              st.blockedByNext = false;

              // Clamp against previous always (we do not "ripple backwards").
              if (wantsRipple) {
                candidateStart = Math.max(candidateStart, st.prevEnd);
              } else {
                const clamped = Math.max(st.prevEnd, Math.min(candidateStart, maxStartClamp));
                const isBlockedByNext = nextStart != null && candidateStart > maxStartClamp + 1e-6;
                candidateStart = clamped;
                st.blockedByNext = isBlockedByNext;

                // One-shot hint: if the user hits the next clip, tell them Shift can push.
                if (isBlockedByNext && !st.showRippleHint) {
                  st.showRippleHint = true;
                  setRippleHint({ id: st.clipId });
                  window.setTimeout(() => setRippleHint(null), 1200);
                }
              }

              st.latestStartTime = candidateStart;
              st.latestWantsRipple = wantsRipple;
              scheduleDragVisual();
            }}
            onPointerUp={(e) => {
              const st = activeDragRef.current;
              if (!st || e.pointerId !== st.pointerId) return;
              const didDrag = st.didDrag;
              const wantsRipple = st.latestWantsRipple;
              const finalStartTime = st.latestStartTime;
              const clipId = st.clipId;

              if (didDrag) suppressClickRef.current = true;
              endDrag();

              if (!didDrag) return;

              // Commit: compute a stable, no-overlap result (including ripple if requested).
              const res = moveClipNoOverlap({
                clips: items.map((x) => ({ id: x.id, startTime: x.startTime, duration: x.duration })),
                clipId,
                candidateStartTime: finalStartTime,
                mode: wantsRipple ? 'ripple' : 'clamp',
              });

              const byId = new Map(items.map((x) => [x.id, x]));
              const nextItems = res.clips.map((c) => {
                const base = byId.get(c.id);
                if (!base) return null;
                return c.startTime === base.startTime ? base : { ...base, startTime: c.startTime };
              }).filter(Boolean) as SubtitleTrackItem[];

              if (nextItems.length === items.length) {
                onItemsChange?.(nextItems);
              }
            }}
            onPointerCancel={(e) => {
              const st = activeDragRef.current;
              if (!st || e.pointerId !== st.pointerId) return;
              endDrag();
            }}
            onClick={() => {
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              onSelectItem?.(item.id);
            onSegmentClick?.(item.startTime);
          }}
        >
            {isOverrun ? (
              <span
                aria-hidden
                className={cn(
                  'absolute right-1 top-1 z-40 inline-flex items-center gap-1',
                  'rounded-md border border-amber-400/25 bg-amber-500/10 px-1.5 py-0.5',
                  'text-[10px] font-mono tabular-nums text-amber-300/90'
                )}
              >
                <span className="size-1.5 rounded-full bg-amber-400/90 animate-pulse motion-reduce:animate-none" />
                +{Math.max(0, Math.round(audioMs! - windowMs))}ms
              </span>
            ) : null}

            {rippleHint?.id === item.id ? (
              <div
                aria-hidden
                className={cn(
                  'pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2',
                  'rounded-full border border-white/10 bg-black/60 px-2 py-1 text-[10px]',
                  'text-white/80 shadow-[0_10px_30px_rgba(0,0,0,0.35)] backdrop-blur'
                )}
              >
                <span className="mr-1 rounded border border-white/10 bg-white/[0.06] px-1 py-0.5 font-mono text-[10px] text-white/85">
                  Shift
                </span>
                推开后续
              </div>
            ) : null}

            <div className="relative flex min-w-0 items-center gap-2">
              {isAtPlayhead ? <span aria-hidden className="absolute inset-y-1 left-0 w-[2px] rounded-full bg-[linear-gradient(180deg,rgba(168,85,247,0.9),rgba(34,211,238,0.9))] shadow-[0_0_14px_rgba(34,211,238,0.35)]" /> : null}
              {isPlaying ? (
                <span
                  aria-hidden
                  className="size-1.5 shrink-0 rounded-full bg-primary/80 animate-pulse motion-reduce:animate-none"
                />
              ) : null}

              <div className="relative min-w-0 flex-1">
                <div className="min-w-0 overflow-hidden whitespace-nowrap text-[11px] font-medium leading-tight text-foreground/90">
                  {item.text}
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Split 分割点连接线 + 剪刀图标 */}
      {splitScissorPositions.map((pos) => (
        <div
          key={`scissors-${pos.opId}`}
          aria-hidden
          className="pointer-events-none absolute top-0 z-20 flex h-full -translate-x-1/2 flex-col items-center justify-center"
          style={{ left: `${pos.leftPct}%` }}
        >
          <div className="absolute inset-y-0 w-px bg-teal-400/30" />
          <div className="absolute inset-y-0 w-px bg-teal-400/20 blur-[2px]" />
          <div className="relative flex items-center justify-center rounded-full border border-teal-400/40 bg-background/80 p-0.5 shadow-[0_0_8px_rgba(45,212,191,0.2)]">
            <Scissors className="size-3 text-teal-400/90" />
          </div>
        </div>
      ))}

      {items.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm pointer-events-none">
          —
        </div>
      ) : null}
    </div>
  );
});

SubtitleTrack.displayName = 'SubtitleTrack';
