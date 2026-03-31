"use client";

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Scissors } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { SubtitleTrackItem } from './types';
import { buildSubtitleTrackLayout } from './subtitle-track-layout';
import { moveClipNoOverlap } from '@/shared/lib/timeline/collision';
import { WaveformBackdrop, type WaveformBackdropStatus } from './waveform-backdrop';

interface SubtitleTrackProps {
  items: SubtitleTrackItem[];
  onAddItem?: () => void;
  totalDuration: number;
  currentTime?: number;
  zoom?: number;
  pxPerSec?: number;
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
  blockedItemId?: string | null;
  blockedState?: 'loading' | 'retrying' | 'network_failed' | 'voice_unavailable' | null;
  blockedLabel?: string | null;
}

function getRelativeRunPct(runLeftPct: number, runWidthPct: number, valuePct: number) {
  if (runWidthPct <= 0) return 0;
  return ((valuePct - runLeftPct) / runWidthPct) * 100;
}

export const SubtitleTrack = memo(function SubtitleTrack({
  items,
  totalDuration,
  currentTime,
  zoom: _zoom = 1,
  pxPerSec: pxPerSecProp,
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
  blockedItemId = null,
  blockedState = null,
  blockedLabel = null,
}: SubtitleTrackProps) {
  const safeTotalDuration = Math.max(0.001, totalDuration);
  const pxPerSec = Math.max(1, pxPerSecProp ?? Math.round(40 * _zoom));
  const canEdit = typeof onItemsChange === 'function';
  const playingItemId =
    playingIndex >= 0 && playingIndex < items.length ? items[playingIndex]?.id ?? null : null;

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
  const minorStepSeconds = 1;
  const majorStepSeconds = 5;
  const minorStepPct = Math.min(100, (minorStepSeconds / safeTotalDuration) * 100);
  const majorStepPct = Math.min(100, (majorStepSeconds / safeTotalDuration) * 100);

  const layout = useMemo(() => {
    return buildSubtitleTrackLayout({
      items,
      totalDuration: safeTotalDuration,
      pxPerSec,
      narrowPx: 24,
    });
  }, [items, safeTotalDuration, pxPerSec]);

  const orderedEntries = layout.entries;
  const orderedRuns = layout.runs;

  const orderedIndexById = useMemo(
    () => new Map(orderedEntries.map((entry, index) => [entry.item.id, index])),
    [orderedEntries]
  );

  const entryById = useMemo(
    () => new Map(orderedEntries.map((entry) => [entry.item.id, entry])),
    [orderedEntries]
  );

  // 构建 splitOperationId → 相邻子段之间的分割点位置（用于渲染剪刀图标）
  const splitScissorPositions = useMemo(() => {
    const result: Array<{ leftPct: number; opId: string }> = [];
    for (let i = 0; i + 1 < orderedEntries.length; i++) {
      const a = orderedEntries[i]?.item;
      const b = orderedEntries[i + 1]?.item;
      if (
        a?.splitOperationId &&
        b?.splitOperationId &&
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
  }, [orderedEntries, safeTotalDuration]);

  const blockedEntry = useMemo(
    () => (blockedItemId ? entryById.get(blockedItemId) ?? null : null),
    [blockedItemId, entryById]
  );

  const getEntryState = useCallback((entry: (typeof orderedEntries)[number]) => {
    const { item } = entry;
    const isSelected = selectedItem === item.id;
    const isPlaying = playingItemId === item.id;
    const isAtPlayhead = isPlaying;
    const isDragging = draggingId === item.id;
    const audioMs = audioDurationMsById?.[item.id];
    const windowMs = Math.max(0, Math.round(item.duration * 1000));
    const isOverrun =
      typeof audioMs === 'number' &&
      Number.isFinite(audioMs) &&
      audioMs > windowMs + audioOverrunToleranceMs;
    const isSplitItem = variant === 'converted' && Boolean(item.splitOperationId);
    const isSplitSiblingHovered = isSplitItem && hoveredSplitOpId === item.splitOperationId;
    const precision = item.duration < 1 ? 3 : 2;
    const timeRangeLabel = `${item.startTime.toFixed(precision)}s - ${(item.startTime + item.duration).toFixed(precision)}s`;

    return {
      isSelected,
      isPlaying,
      isAtPlayhead,
      isDragging,
      audioMs,
      windowMs,
      isOverrun,
      isSplitItem,
      isSplitSiblingHovered,
      timeRangeLabel,
    };
  }, [
    audioDurationMsById,
    audioOverrunToleranceMs,
    draggingId,
    hoveredSplitOpId,
    playingItemId,
    selectedItem,
    variant,
  ]);

  const getInteractionProps = useCallback((item: SubtitleTrackItem, orderedIndex: number) => ({
    onPointerEnter: () => {
      if (variant === 'converted' && item.splitOperationId) {
        setHoveredSplitOpId(item.splitOperationId);
      }
    },
    onPointerLeave: () => {
      if (variant === 'converted' && item.splitOperationId) {
        setHoveredSplitOpId(null);
      }
    },
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (!canEdit) return;
      if (e.button !== 0) return;

      const el = e.currentTarget;
      const trackEl = rootRef.current;
      if (!trackEl) return;

      const rect = trackEl.getBoundingClientRect();
      const trackWidthPx = Math.max(1, rect.width);
      const secPerPx = safeTotalDuration / trackWidthPx;
      const prev = orderedIndex > 0 ? orderedEntries[orderedIndex - 1]?.item : null;
      const next =
        orderedIndex + 1 < orderedEntries.length ? orderedEntries[orderedIndex + 1]?.item : null;
      const prevEnd = prev ? prev.startTime + prev.duration : 0;
      const maxStartVideo = Math.max(0, safeTotalDuration - item.duration);

      activeDragRef.current = {
        pointerId: e.pointerId,
        clipId: item.id,
        clipIndex: orderedIndex,
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
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      const st = activeDragRef.current;
      if (!st || e.pointerId !== st.pointerId) return;
      const dx = e.clientX - st.startClientX;
      if (!st.didDrag && Math.abs(dx) >= 6) st.didDrag = true;
      if (!st.didDrag) return;

      const wantsRipple = e.shiftKey === true;
      let candidateStart = st.baseStartTime + dx * st.secPerPx;
      candidateStart = Math.max(0, Math.min(candidateStart, st.maxStartVideo));

      const nextStart = st.nextStart;
      const maxStartClamp =
        nextStart == null ? st.maxStartVideo : Math.min(st.maxStartVideo, nextStart - st.duration);
      st.blockedByNext = false;

      if (wantsRipple) {
        candidateStart = Math.max(candidateStart, st.prevEnd);
      } else {
        const clamped = Math.max(st.prevEnd, Math.min(candidateStart, maxStartClamp));
        const isBlockedByNext = nextStart != null && candidateStart > maxStartClamp + 1e-6;
        candidateStart = clamped;
        st.blockedByNext = isBlockedByNext;

        if (isBlockedByNext && !st.showRippleHint) {
          st.showRippleHint = true;
          setRippleHint({ id: st.clipId });
          window.setTimeout(() => setRippleHint(null), 1200);
        }
      }

      st.latestStartTime = candidateStart;
      st.latestWantsRipple = wantsRipple;
      scheduleDragVisual();
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      const st = activeDragRef.current;
      if (!st || e.pointerId !== st.pointerId) return;
      const didDrag = st.didDrag;
      const wantsRipple = st.latestWantsRipple;
      const finalStartTime = st.latestStartTime;
      const clipId = st.clipId;

      if (didDrag) suppressClickRef.current = true;
      endDrag();

      if (!didDrag) return;

      const res = moveClipNoOverlap({
        clips: items.map((x) => ({ id: x.id, startTime: x.startTime, duration: x.duration })),
        clipId,
        candidateStartTime: finalStartTime,
        mode: wantsRipple ? 'ripple' : 'clamp',
      });

      const byId = new Map(items.map((x) => [x.id, x]));
      const nextItems = res.clips
        .map((clip) => {
          const base = byId.get(clip.id);
          if (!base) return null;
          return clip.startTime === base.startTime ? base : { ...base, startTime: clip.startTime };
        })
        .filter(Boolean) as SubtitleTrackItem[];

      if (nextItems.length === items.length) {
        onItemsChange?.(nextItems);
      }
    },
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => {
      const st = activeDragRef.current;
      if (!st || e.pointerId !== st.pointerId) return;
      endDrag();
    },
    onClick: () => {
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      onSelectItem?.(item.id);
      onSegmentClick?.(item.startTime);
    },
  }), [
    canEdit,
    endDrag,
    items,
    onItemsChange,
    onSegmentClick,
    onSelectItem,
    orderedEntries,
    safeTotalDuration,
    scheduleDragVisual,
    variant,
  ]);

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

      {/* Visual runs */}
      {orderedRuns.map((run) => {
        if (run.mode === 'dense') {
          const denseEntries = run.itemIds
            .map((itemId) => entryById.get(itemId))
            .filter((entry): entry is NonNullable<typeof entry> => entry != null);

          const denseStates = denseEntries.map((entry) => ({
            entry,
            state: getEntryState(entry),
          }));

          const hasSplitItem = denseStates.some(({ state }) => state.isSplitItem);
          const hasSelectedItem = denseStates.some(({ state }) => state.isSelected);
          const hasPlayheadItem = denseStates.some(({ state }) => state.isAtPlayhead);
          const hasHoveredSplitSibling = denseStates.some(
            ({ state }) => state.isSplitSiblingHovered && !state.isSelected && !state.isAtPlayhead
          );
          const runBodyStyle = hasSplitItem
            ? {
                backgroundImage:
                  'linear-gradient(180deg, rgba(8, 18, 20, 0.66), rgba(10, 28, 30, 0.78))',
              }
            : variant === 'original'
              ? {
                  backgroundImage:
                    'linear-gradient(180deg, rgba(17, 24, 39, 0.52), rgba(30, 41, 59, 0.62))',
                }
              : {
                  backgroundImage:
                    'linear-gradient(180deg, rgba(24, 24, 34, 0.46), rgba(33, 29, 48, 0.64))',
                };
          const runInnerStyle = hasSplitItem
            ? {
                backgroundImage:
                  'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(153,246,228,0.035) 24%, rgba(15,23,42,0.02) 100%)',
              }
            : {
                backgroundImage:
                  'linear-gradient(180deg, rgba(255,255,255,0.055), rgba(255,255,255,0.02) 24%, rgba(15,23,42,0.015) 100%)',
              };

          return (
            <div
              key={run.id}
              data-run-mode="dense"
              data-dense-run="true"
              className={cn(
                'pointer-events-none absolute top-2.5 h-11 overflow-hidden rounded-md border',
                'border-white/8 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]',
                hasSplitItem ? 'border-teal-300/12' : null,
                hasPlayheadItem
                  ? hasSplitItem
                    ? 'ring-1 ring-teal-300/18'
                    : 'ring-1 ring-white/8'
                  : null,
                hasSelectedItem
                  ? hasSplitItem
                    ? 'border-teal-300/18'
                    : 'border-white/10'
                  : null,
                hasHoveredSplitSibling ? 'ring-1 ring-teal-300/12' : null
              )}
              style={{
                left: `${run.leftPct}%`,
                width: `${run.widthPct}%`,
              }}
            >
              <span
                aria-hidden
                className="absolute inset-0 rounded-[inherit]"
                style={runBodyStyle}
              />
              <span
                aria-hidden
                className="absolute inset-[1px] rounded-[7px]"
                style={runInnerStyle}
              />
              <span
                aria-hidden
                className={cn(
                  'absolute inset-x-2 top-[3px] h-[1px] rounded-full',
                  hasSplitItem ? 'bg-teal-100/10' : 'bg-white/10'
                )}
              />

              {denseStates.map(({ entry, state }) => {
                const localLeftPct = getRelativeRunPct(run.leftPct, run.widthPct, entry.leftPct);
                const localWidthPct = run.widthPct <= 0 ? 0 : (entry.widthPct / run.widthPct) * 100;
                const seamStyle = state.isSplitItem
                  ? {
                      backgroundImage:
                        'linear-gradient(90deg, rgba(0,0,0,0), rgba(153,246,228,0.05) 36%, rgba(15,118,110,0.58) 50%, rgba(153,246,228,0.05) 64%, rgba(0,0,0,0))',
                    }
                  : {
                      backgroundImage:
                        'linear-gradient(90deg, rgba(0,0,0,0), rgba(255,255,255,0.05) 36%, rgba(148,163,184,0.42) 50%, rgba(255,255,255,0.05) 64%, rgba(0,0,0,0))',
                    };
                const activeSegmentStyle = state.isSplitItem
                  ? {
                      backgroundImage:
                        'linear-gradient(180deg, rgba(204,251,241,0.12), rgba(94,234,212,0.08) 42%, rgba(13,148,136,0.12) 100%)',
                    }
                  : {
                      backgroundImage:
                        'linear-gradient(180deg, rgba(255,255,255,0.13), rgba(226,232,240,0.06) 42%, rgba(148,163,184,0.1) 100%)',
                    };
                const energyEdgeTone = state.isSplitItem
                  ? 'border-teal-200/22 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]'
                  : 'border-white/12 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]';
                const activeBeamTone = state.isSplitItem
                  ? 'bg-[linear-gradient(90deg,rgba(204,251,241,0),rgba(204,251,241,0.52),rgba(204,251,241,0))]'
                  : 'bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,0.42),rgba(255,255,255,0))]';
                const isActiveSegment = state.isSelected || state.isAtPlayhead || state.isPlaying;

                return (
                  <React.Fragment key={entry.item.id}>
                    {isActiveSegment ? (
                      <span
                        data-dense-selected-item={state.isSelected ? entry.item.id : undefined}
                        aria-hidden
                        className={cn(
                          'absolute inset-y-[4px] rounded-[7px] border backdrop-blur-[1px]',
                          energyEdgeTone,
                          state.isSelected ? 'shadow-[0_0_0_1px_rgba(255,255,255,0.03)]' : null,
                          state.isPlaying ? 'animate-pulse motion-reduce:animate-none' : null,
                          state.isAtPlayhead ? 'ring-1 ring-white/10' : null
                        )}
                        style={{
                          left: `${localLeftPct}%`,
                          width: `${localWidthPct}%`,
                          minWidth: state.isSelected ? '6px' : '4px',
                          ...activeSegmentStyle,
                        }}
                      />
                    ) : null}

                    <span
                      data-dense-boundary-item={entry.item.id}
                      aria-hidden
                      className={cn(
                        'absolute inset-y-[7px] w-[3px] -translate-x-1/2 opacity-0 transition-opacity duration-150',
                        isActiveSegment
                          ? state.isSplitItem
                            ? 'opacity-65'
                            : 'opacity-50'
                          : null
                      )}
                      style={{
                        left: `${localLeftPct}%`,
                        ...seamStyle,
                      }}
                    />

                    {isActiveSegment ? (
                      <>
                        <span
                          aria-hidden
                          className={cn(
                            'absolute top-[5px] h-[1px] rounded-full',
                            activeBeamTone
                          )}
                          style={{
                            left: `${localLeftPct}%`,
                            width: `${localWidthPct}%`,
                            minWidth: state.isSelected ? '6px' : '4px',
                          }}
                        />
                      </>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </div>
          );
        }

        const entry = entryById.get(run.itemIds[0]);
        if (!entry) return null;

        const { item, leftPct, widthPct } = entry;
        const orderedIndex = orderedIndexById.get(item.id) ?? 0;
        const state = getEntryState(entry);
        const title = [
          `${item.text} (${state.timeRangeLabel})`,
          state.isOverrun
            ? `Overrun / 超窗: audio ${(state.audioMs! / 1000).toFixed(2)}s > window ${(state.windowMs / 1000).toFixed(2)}s. Tip: extend this clip or hold Shift to ripple.`
            : null,
        ]
          .filter(Boolean)
          .join('\n');
        const interactionProps = getInteractionProps(item, orderedIndex);
        const itemBaseColors = state.isSplitItem
          ? 'border-teal-400/20 bg-teal-400/8 hover:bg-teal-400/12'
          : baseColors;
        const compactDotColors = state.isSplitItem
          ? 'bg-teal-300/90 shadow-[0_0_10px_rgba(45,212,191,0.45)]'
          : 'bg-primary/90 shadow-[0_0_10px_rgba(168,85,247,0.45)]';

        return (
          <div
            key={run.id}
            data-run-mode={run.mode}
            data-item-anchor="true"
            data-item-id={item.id}
            data-visual-mode={entry.visualMode}
            className={cn(
              'absolute top-2.5 h-11 cursor-pointer overflow-hidden transition-[background-color,border-color,box-shadow] duration-150',
              run.mode === 'normal' ? 'rounded-md border px-2.5' : 'rounded-[10px] border',
              itemBaseColors,
              state.isPlaying
                ? state.isSplitItem
                  ? 'bg-teal-400/20 border-teal-400/50 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_10px_30px_rgba(45,212,191,0.2)]'
                  : 'bg-primary/20 border-primary/45 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_10px_30px_rgba(76,29,149,0.28)]'
                : null,
              state.isAtPlayhead
                ? state.isSplitItem
                  ? 'border-teal-400/70 ring-1 ring-teal-400/35 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_28px_rgba(45,212,191,0.18)]'
                  : 'border-primary/70 ring-1 ring-primary/35 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_28px_rgba(168,85,247,0.18)]'
                : null,
              state.isSelected
                ? state.isSplitItem
                  ? 'border-teal-400/55 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]'
                  : 'border-primary/55 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]'
                : null,
              state.isSplitSiblingHovered && !state.isSelected && !state.isAtPlayhead
                ? 'ring-1 ring-teal-400/25'
                : null,
              state.isDragging
                ? 'z-40 cursor-grabbing ring-1 ring-primary/40 shadow-[0_18px_40px_rgba(0,0,0,0.35)]'
                : 'z-10'
            )}
            style={{
              left: `${leftPct}%`,
              width: `${widthPct}%`,
            }}
            title={title}
            {...interactionProps}
          >
            {state.isOverrun ? (
              <span
                aria-hidden
                className={cn(
                  'absolute right-1 top-1 z-40 inline-flex items-center gap-1',
                  'rounded-md border border-amber-400/25 bg-amber-500/10 px-1.5 py-0.5',
                  'text-[10px] font-mono tabular-nums text-amber-300/90'
                )}
              >
                <span className="size-1.5 rounded-full bg-amber-400/90 animate-pulse motion-reduce:animate-none" />
                +{Math.max(0, Math.round(state.audioMs! - state.windowMs))}ms
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

            {run.mode === 'compact' ? (
              <>
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-x-0 top-1/2 h-px -translate-y-1/2',
                    state.isSplitItem ? 'bg-teal-300/24' : 'bg-primary/24'
                  )}
                />
                <span className="absolute inset-0 flex items-center justify-center">
                  <span
                    className={cn(
                      'size-1.5 rounded-full',
                      state.isPlaying || state.isAtPlayhead
                        ? cn(compactDotColors, 'animate-pulse motion-reduce:animate-none')
                        : state.isSplitItem
                          ? 'bg-teal-300/60'
                          : 'bg-foreground/50'
                    )}
                  />
                </span>
              </>
            ) : (
              <div className="relative flex min-w-0 items-center gap-2">
                {state.isAtPlayhead ? (
                  <span
                    aria-hidden
                    className="absolute inset-y-1 left-0 w-[2px] rounded-full bg-[linear-gradient(180deg,rgba(168,85,247,0.9),rgba(34,211,238,0.9))] shadow-[0_0_14px_rgba(34,211,238,0.35)]"
                  />
                ) : null}
                {state.isPlaying ? (
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
            )}
          </div>
        );
      })}

      {/* Dense item anchors keep hit-testing and drag semantics on single subtitles. */}
      {orderedEntries
        .filter((entry) => entry.visualMode === 'dense')
        .map((entry) => {
          const { item, hitboxInsetPx, hitboxLeftPct, hitboxWidthPct, widthPx } = entry;
          const orderedIndex = orderedIndexById.get(item.id) ?? 0;
          const state = getEntryState(entry);
          const title = [
            `${item.text} (${state.timeRangeLabel})`,
            state.isOverrun
              ? `Overrun / 超窗: audio ${(state.audioMs! / 1000).toFixed(2)}s > window ${(state.windowMs / 1000).toFixed(2)}s. Tip: extend this clip or hold Shift to ripple.`
              : null,
          ]
            .filter(Boolean)
            .join('\n');
          const interactionProps = getInteractionProps(item, orderedIndex);

          return (
            <div
              key={`anchor:${item.id}`}
              data-item-anchor="true"
              data-item-id={item.id}
              data-visual-mode="dense"
              className={cn(
                'absolute top-2.5 h-11 cursor-pointer bg-transparent',
                state.isDragging ? 'z-40 cursor-grabbing' : 'z-20'
              )}
              style={{
                left: `${hitboxLeftPct}%`,
                width: `${hitboxWidthPct}%`,
              }}
              title={title}
              {...interactionProps}
            >
              <span aria-hidden className="absolute inset-0 bg-transparent" />

              {state.isDragging ? (
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-y-1 rounded-[8px] border',
                    state.isSplitItem
                      ? 'border-teal-300/45 bg-teal-300/18 shadow-[0_0_18px_rgba(45,212,191,0.24)]'
                      : 'border-primary/45 bg-primary/18 shadow-[0_0_18px_rgba(168,85,247,0.2)]'
                  )}
                  style={{
                    left: `${hitboxInsetPx}px`,
                    width: `${widthPx}px`,
                    minWidth: '1px',
                  }}
                />
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

      {blockedEntry && blockedState && blockedLabel ? (
        <div
          data-blocked-item-id={blockedEntry.item.id}
          data-blocked-state={blockedState}
          className="pointer-events-none absolute top-0 z-40 -translate-x-1/2"
          style={{ left: `${blockedEntry.leftPct + blockedEntry.widthPct / 2}%` }}
        >
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium backdrop-blur',
              blockedState === 'loading' && 'border-amber-300/30 bg-amber-400/12 text-amber-100',
              blockedState === 'retrying' && 'border-orange-300/30 bg-orange-400/12 text-orange-100',
              blockedState === 'network_failed' && 'border-rose-300/30 bg-rose-400/12 text-rose-100',
              blockedState === 'voice_unavailable' && 'border-sky-300/30 bg-sky-400/12 text-sky-100'
            )}
          >
            {blockedLabel}
          </span>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm pointer-events-none">
          —
        </div>
      ) : null}
    </div>
  );
});

SubtitleTrack.displayName = 'SubtitleTrack';
