'use client';

import React, { memo, useMemo, useRef, useEffect, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import { Card, CardContent } from '@/shared/components/ui/card';
import { cn } from '@/shared/lib/utils';
import { SubtitleTrackItem } from '@/shared/components/video-editor/types';
import { useTranslations } from 'next-intl';
import { usePausedVideoPrefetch } from '@/shared/hooks/use-paused-video-prefetch';

import type { EditorTransportSnapshot } from './editor-transport';

interface VideoPreviewPanelProps {
    className?: string;
    videoUrl?: string;
    transportSnapshot: EditorTransportSnapshot;
    subtitleTrack: SubtitleTrackItem[];
    isVideoTextShow?: boolean;
    onPlayStateChange?: (isPlaying: boolean) => void;
    // Subtitle editing callbacks
    onSubtitleUpdate?: (id: string, text: string) => void;
}

export interface VideoPreviewRef {
    videoElement: HTMLVideoElement | null;
}

export const VideoPreviewPanel = memo(forwardRef<VideoPreviewRef, VideoPreviewPanelProps>(({
    className,
    videoUrl,
    transportSnapshot,
    subtitleTrack,
    isVideoTextShow = true,
    onPlayStateChange,
    onSubtitleUpdate
}, ref) => {
    const t = useTranslations('video_convert.videoEditor.videoEditor');
    const stageRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [subtitlePosition, setSubtitlePosition] = useState({ x: 50, y: 95 });
    const [isDraggingSubtitle, setIsDraggingSubtitle] = useState(false);
    const [editingSubtitle, setEditingSubtitle] = useState<string | null>(null);
    const [editingText, setEditingText] = useState<string>('');
    const subtitleElRef = useRef<HTMLDivElement>(null);
    const subtitlePosRef = useRef(subtitlePosition);
    const dragRef = useRef<{
        pointerId: number;
        stageRect: DOMRect;
        videoRect: DOMRect;
        latestX: number;
        latestY: number;
        rafId: number | null;
    } | null>(null);
    const activeSubtitleIndex = transportSnapshot.activeTimelineClipIndex;
    const activeSubtitle = useMemo(() => {
        if (activeSubtitleIndex == null || activeSubtitleIndex < 0) return null;
        return subtitleTrack[activeSubtitleIndex] || null;
    }, [activeSubtitleIndex, subtitleTrack]);

    usePausedVideoPrefetch(videoRef, {
        enabled: Boolean(videoUrl),
        minBufferedAheadSeconds: 8,
    });

    useImperativeHandle(ref, () => ({
        get videoElement() { return videoRef.current; }
    }));

    useEffect(() => {
        subtitlePosRef.current = subtitlePosition;
    }, [subtitlePosition]);

    // Intentionally do NOT "drive" the <video> element from React state here.
    // The parent (page.tsx) owns the imperative sync boundary via video-sync-controller.ts,
    // which avoids scattered play() / pause() / seek races inside the preview component.

    const clamp = useCallback((n: number, min: number, max: number) => {
        return Math.min(max, Math.max(min, n));
    }, []);

    const applySubtitlePositionPct = useCallback((next: { x: number; y: number }) => {
        subtitlePosRef.current = next;
        const el = subtitleElRef.current;
        if (!el) return;
        el.style.left = `${next.x}%`;
        el.style.top = `${next.y}%`;
    }, []);

    const commitDragFrame = useCallback(() => {
        const st = dragRef.current;
        if (!st) return;

        const stageRect = st.stageRect;
        const videoRect = st.videoRect;

        const x = clamp(st.latestX, videoRect.left, videoRect.right);
        const y = clamp(st.latestY, videoRect.top, videoRect.bottom);

        const pctX = stageRect.width <= 0 ? 50 : ((x - stageRect.left) / stageRect.width) * 100;
        const pctY = stageRect.height <= 0 ? 50 : ((y - stageRect.top) / stageRect.height) * 100;

        applySubtitlePositionPct({
            x: clamp(pctX, 0, 100),
            y: clamp(pctY, 0, 100),
        });
    }, [applySubtitlePositionPct, clamp]);

    const scheduleDragFrame = useCallback(() => {
        const st = dragRef.current;
        if (!st || st.rafId != null) return;
        st.rafId = requestAnimationFrame(() => {
            const cur = dragRef.current;
            if (cur) cur.rafId = null;
            commitDragFrame();
        });
    }, [commitDragFrame]);

    const endDrag = useCallback((e?: React.PointerEvent) => {
        const st = dragRef.current;
        dragRef.current = null;
        if (st?.rafId != null) cancelAnimationFrame(st.rafId);
        st && (st.rafId = null);
        setIsDraggingSubtitle(false);
        // Persist the last visually applied position into React state.
        setSubtitlePosition(subtitlePosRef.current);
        if (e) {
            try {
                (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
            } catch {
                // ignore
            }
        }
    }, []);

    return (
        <Card className={cn("bg-black h-full overflow-hidden border-0 rounded-none", className)}>
            <CardContent ref={stageRef} className="p-0 relative h-full flex items-center justify-center bg-black/90">
                {videoUrl ? (
                    <video
                        ref={videoRef}
                        src={videoUrl}
                        preload="auto"
                        playsInline
                        className="max-w-full max-h-full object-contain"
                        onPlay={() => onPlayStateChange?.(true)}
                        onPause={() => onPlayStateChange?.(false)}
                        controls={false}
                    />
                ) : (
                    <div className="text-muted-foreground">{t('placeholder.addVideoToTrack')}</div>
                )}

                {/* Subtitle Overlay */}
                {activeSubtitle && isVideoTextShow ? (
                    <div
                        key={activeSubtitle.id}
                        ref={subtitleElRef}
                        className={cn(
                            "absolute cursor-grab px-3 py-1 rounded backdrop-blur-sm touch-none",
                            "bg-[rgba(0,0,0,0.7)] hover:bg-[rgba(0,0,0,0.8)]",
                            editingSubtitle === activeSubtitle.id && "bg-[rgba(0,0,0,0.9)] ring-1 ring-primary",
                            isDraggingSubtitle ? "cursor-grabbing" : "transition-colors duration-150"
                        )}
                        style={{
                            left: `${subtitlePosition.x}%`,
                            top: `${subtitlePosition.y}%`,
                            transform: 'translate(-50%, -50%)',
                            fontSize: `${activeSubtitle.fontSize || 16}px`,
                            color: activeSubtitle.color || '#ffffff',
                            whiteSpace: 'pre-wrap',
                            textAlign: 'center',
                            maxWidth: '80%'
                        }}
                        onPointerDown={(e) => {
                            if (editingSubtitle === activeSubtitle.id) return;
                            if (e.button !== 0) return;
                            const stageEl = stageRef.current;
                            const videoEl = videoRef.current;
                            if (!stageEl || !videoEl) return;

                            e.preventDefault();
                            e.stopPropagation();

                            const stageRect = stageEl.getBoundingClientRect();
                            const videoRect = videoEl.getBoundingClientRect();

                            dragRef.current = {
                                pointerId: e.pointerId,
                                stageRect,
                                videoRect,
                                latestX: e.clientX,
                                latestY: e.clientY,
                                rafId: null,
                            };

                            try {
                                (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                            } catch {
                                // ignore
                            }

                            setIsDraggingSubtitle(true);
                            // Apply immediately so the subtitle doesn't "lag" on the first move.
                            commitDragFrame();
                        }}
                        onPointerMove={(e) => {
                            const st = dragRef.current;
                            if (!st || e.pointerId !== st.pointerId) return;
                            st.latestX = e.clientX;
                            st.latestY = e.clientY;
                            scheduleDragFrame();
                        }}
                        onPointerUp={(e) => {
                            const st = dragRef.current;
                            if (!st || e.pointerId !== st.pointerId) return;
                            // Commit the final frame before ending.
                            st.latestX = e.clientX;
                            st.latestY = e.clientY;
                            commitDragFrame();
                            endDrag(e);
                        }}
                        onPointerCancel={(e) => {
                            const st = dragRef.current;
                            if (!st || e.pointerId !== st.pointerId) return;
                            endDrag(e);
                        }}
                        onDoubleClick={() => {
                            setEditingSubtitle(activeSubtitle.id);
                            setEditingText(activeSubtitle.text);
                        }}
                    >
                        {editingSubtitle === activeSubtitle.id ? (
                            <input
                                type="text"
                                value={editingText}
                                onChange={(e) => setEditingText(e.target.value)}
                                onBlur={() => {
                                    if (editingText.trim()) {
                                        onSubtitleUpdate?.(activeSubtitle.id, editingText.trim());
                                    }
                                    setEditingSubtitle(null);
                                }}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.currentTarget.blur();
                                    }
                                }}
                                autoFocus
                                className="bg-transparent border-none outline-none text-center text-inherit font-bold w-full min-w-[200px]"
                            />
                        ) : (
                            <span className="font-bold drop-shadow-md pointer-events-none">
                                {activeSubtitle.text}
                            </span>
                        )}
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
}));

VideoPreviewPanel.displayName = 'VideoPreviewPanel';
