'use client';

import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';

type UseVideoEditorLayoutArgs = {
  locale: string;
  timelineHeightStorageKey?: string;
};

export function useVideoEditorLayout(args: UseVideoEditorLayoutArgs) {
  const { locale, timelineHeightStorageKey = 'revoice.video_editor.timeline_h_v1' } = args;
  const [zoom, setZoom] = useState(2);
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
      const raw = window.localStorage.getItem(timelineHeightStorageKey);
      const n = raw ? Number.parseInt(raw, 10) : NaN;
      if (Number.isFinite(n) && n >= 120 && n <= 520) setTimelineHeightPx(n);
    } catch {
      // ignore
    }
  }, [timelineHeightStorageKey]);

  useEffect(() => {
    return () => {
      timelineDragRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  const timelineResizeHandleLabel = locale === 'zh' ? '调整时间线高度' : 'Resize timeline height';

  const handleTimelineResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      const el = e.currentTarget;
      const body = bodyRef.current;
      if (!body) return;

      const rect = body.getBoundingClientRect();
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
    },
    [timelineHeightPx]
  );

  const handleTimelineResizePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const st = timelineDragRef.current;
    if (!st || e.pointerId !== st.pointerId) return;
    const dy = st.startY - e.clientY;
    const next = Math.max(120, Math.min(st.maxHeight, Math.round(st.startHeight + dy)));
    setTimelineHeightPx(next);
  }, []);

  const handleTimelineResizePointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const st = timelineDragRef.current;
      if (!st || e.pointerId !== st.pointerId) return;
      timelineDragRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        window.localStorage.setItem(timelineHeightStorageKey, String(timelineHeightRef.current));
      } catch {
        // ignore
      }
    },
    [timelineHeightStorageKey]
  );

  const handleTimelineResizePointerCancel = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const st = timelineDragRef.current;
    timelineDragRef.current = null;
    if (st) {
      try {
        e.currentTarget.releasePointerCapture(st.pointerId);
      } catch {
        // ignore
      }
    }
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, []);

  return {
    zoom,
    setZoom,
    bodyRef,
    timelineHeightPx,
    timelineResizeHandleLabel,
    handleTimelineResizePointerDown,
    handleTimelineResizePointerMove,
    handleTimelineResizePointerUp,
    handleTimelineResizePointerCancel,
  };
}
