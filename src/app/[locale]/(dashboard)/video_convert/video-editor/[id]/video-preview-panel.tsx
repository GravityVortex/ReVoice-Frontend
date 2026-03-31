'use client';

import React, { memo, useMemo, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { Card, CardContent } from '@/shared/components/ui/card';
import { cn } from '@/shared/lib/utils';
import { SubtitleTrackItem } from '@/shared/components/video-editor/types';
import { useTranslations } from 'next-intl';
import { usePausedVideoPrefetch } from '@/shared/hooks/use-paused-video-prefetch';
import { Film } from 'lucide-react';

import type { EditorTransportSnapshot } from './editor-transport';
import { PlaybackGateCard } from './playback-gate-card';
import { resolvePreviewEditingSubtitle, resolvePreviewSubtitleCommitOutcome } from './video-preview-edit-session';

interface VideoPreviewPanelProps {
    className?: string;
    videoUrl?: string;
    transportSnapshot: EditorTransportSnapshot;
    subtitleTrack: SubtitleTrackItem[];
    isVideoTextShow?: boolean;
    onPlayStateChange?: (isPlaying: boolean) => void;
    onRetryBlockedPlayback?: () => void;
    onCancelBlockedPlayback?: () => void;
    onLocateBlockedClip?: () => void;
    // Subtitle editing callbacks
    onSubtitleUpdate?: (id: string, text: string) => boolean;
}

export interface VideoPreviewRef {
    videoElement: HTMLVideoElement | null;
}

const PREVIEW_SUBTITLE_POSITION = {
    x: 50,
    y: 95,
};

export const VideoPreviewPanel = memo(forwardRef<VideoPreviewRef, VideoPreviewPanelProps>(({
    className,
    videoUrl,
    transportSnapshot,
    subtitleTrack,
    isVideoTextShow = true,
    onPlayStateChange,
    onRetryBlockedPlayback,
    onCancelBlockedPlayback,
    onLocateBlockedClip,
    onSubtitleUpdate
}, ref) => {
    const t = useTranslations('video_convert.videoEditor.videoEditor');
    const videoRef = useRef<HTMLVideoElement>(null);
    const subtitleInputRef = useRef<HTMLInputElement>(null);
    const [editingSubtitle, setEditingSubtitle] = useState<string | null>(null);
    const [editingText, setEditingText] = useState<string>('');
    const [editingHint, setEditingHint] = useState<string | null>(null);
    const activeSubtitleIndex = transportSnapshot.activeTimelineClipIndex;
    const activeSubtitle = useMemo(() => {
        return resolvePreviewEditingSubtitle({
            activeSubtitleIndex,
            subtitleTrack,
            editingSubtitleId: editingSubtitle,
        });
    }, [activeSubtitleIndex, editingSubtitle, subtitleTrack]);
    const blockingState = transportSnapshot.blockingState ?? null;
    const gateCopy = useMemo(() => {
        if (!blockingState) return null;
        const clip = activeSubtitleIndex >= 0 ? t('playbackGate.clipLabel', { index: activeSubtitleIndex + 1 }) : t('playbackGate.clipLabelFallback');

        switch (blockingState.kind) {
            case 'loading':
                return {
                    state: 'loading' as const,
                    title: t('playbackGate.title.loading'),
                    description: t('playbackGate.description.loading', { clip }),
                    detail: t('playbackGate.detail.loading'),
                    primaryAction: { label: t('playbackGate.action.cancel'), onClick: onCancelBlockedPlayback, tone: 'secondary' as const },
                };
            case 'retrying':
                return {
                    state: 'retrying' as const,
                    title: t('playbackGate.title.retrying'),
                    description: t('playbackGate.description.retrying', { clip }),
                    detail: t('playbackGate.detail.retrying'),
                    primaryAction: { label: t('playbackGate.action.cancel'), onClick: onCancelBlockedPlayback, tone: 'secondary' as const },
                };
            case 'network_failed':
                return {
                    state: 'network_failed' as const,
                    title: t('playbackGate.title.networkFailed'),
                    description: t('playbackGate.description.networkFailed', { clip }),
                    detail: t('playbackGate.detail.networkFailed'),
                    primaryAction: { label: t('playbackGate.action.retry'), onClick: onRetryBlockedPlayback },
                    secondaryAction: { label: t('playbackGate.action.cancel'), onClick: onCancelBlockedPlayback, tone: 'secondary' as const },
                };
            case 'voice_unavailable':
                return {
                    state: 'voice_unavailable' as const,
                    title: t('playbackGate.title.voiceUnavailable'),
                    description: t('playbackGate.description.voiceUnavailable', { clip }),
                    detail: t('playbackGate.detail.voiceUnavailable'),
                    primaryAction: { label: t('playbackGate.action.locateClip'), onClick: onLocateBlockedClip },
                    secondaryAction: { label: t('playbackGate.action.cancel'), onClick: onCancelBlockedPlayback, tone: 'secondary' as const },
                };
            default:
                return null;
        }
    }, [activeSubtitleIndex, blockingState, onCancelBlockedPlayback, onLocateBlockedClip, onRetryBlockedPlayback, t]);

    usePausedVideoPrefetch(videoRef, {
        enabled: Boolean(videoUrl),
        minBufferedAheadSeconds: 8,
    });

    useImperativeHandle(ref, () => ({
        get videoElement() { return videoRef.current; }
    }));

    // Intentionally do NOT "drive" the <video> element from React state here.
    // The parent (page.tsx) owns the imperative sync boundary via video-sync-controller.ts,
    // which avoids scattered play() / pause() / seek races inside the preview component.

    return (
        <Card className={cn("bg-black h-full overflow-hidden border-0 rounded-none", className)}>
            <CardContent className="p-0 relative h-full flex items-center justify-center bg-black/90">
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
                    <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-white/10 bg-white/[0.02] rounded-2xl max-w-xs mx-auto text-center shadow-[inset_0_0_20px_rgba(0,0,0,0.5)]">
                        <div className="relative mb-4">
                             <Film className="w-12 h-12 text-primary/60 animate-pulse" />
                             <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full" />
                        </div>
                        <p className="text-[13px] font-medium text-white/70 tracking-wide">{t('placeholder.addVideoToTrack')}</p>
                    </div>
                )}

                {/* Subtitle Overlay */}
                {activeSubtitle && isVideoTextShow ? (
                    <div
                        className={cn(
                            "absolute px-3 py-1 rounded backdrop-blur-sm",
                            "bg-[rgba(0,0,0,0.7)] hover:bg-[rgba(0,0,0,0.8)]",
                            editingSubtitle === activeSubtitle.id && "bg-[rgba(0,0,0,0.9)] ring-1 ring-primary",
                            "transition-colors duration-150"
                        )}
                        style={{
                            left: `${PREVIEW_SUBTITLE_POSITION.x}%`,
                            top: `${PREVIEW_SUBTITLE_POSITION.y}%`,
                            transform: 'translate(-50%, -50%)',
                            fontSize: `${activeSubtitle.fontSize || 16}px`,
                            color: activeSubtitle.color || '#ffffff',
                            whiteSpace: 'pre-wrap',
                            textAlign: 'center',
                            maxWidth: '80%'
                        }}
                        onDoubleClick={() => {
                            setEditingSubtitle(activeSubtitle.id);
                            setEditingText(activeSubtitle.text);
                            setEditingHint(null);
                        }}
                    >
                        {editingSubtitle === activeSubtitle.id ? (
                            <div className="min-w-[200px]">
                                <input
                                    ref={subtitleInputRef}
                                    type="text"
                                    value={editingText}
                                    onChange={(e) => {
                                        setEditingText(e.target.value);
                                        setEditingHint(null);
                                    }}
                                    onBlur={() => {
                                        const outcome = resolvePreviewSubtitleCommitOutcome({
                                            subtitleId: activeSubtitle.id,
                                            draftText: editingText,
                                            onCommit: onSubtitleUpdate,
                                        });
                                        setEditingText(outcome.nextText);
                                        if (outcome.action === 'keep_editing') {
                                            setEditingHint(t('previewEdit.commitRejected'));
                                            if (typeof window !== 'undefined') {
                                                window.requestAnimationFrame(() => {
                                                    subtitleInputRef.current?.focus();
                                                    subtitleInputRef.current?.select();
                                                });
                                            }
                                            return;
                                        }
                                        setEditingHint(null);
                                        setEditingSubtitle(null);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            e.currentTarget.blur();
                                        }
                                    }}
                                    autoFocus
                                    className="bg-transparent border-none outline-none text-center text-inherit font-bold w-full"
                                />
                                {editingHint ? (
                                    <div className="mt-1 text-center text-[11px] font-medium text-amber-200">
                                        {editingHint}
                                    </div>
                                ) : null}
                            </div>
                        ) : (
                            <span className="font-bold drop-shadow-md pointer-events-none">
                                {activeSubtitle.text}
                            </span>
                        )}
                    </div>
                ) : null}

                {gateCopy ? (
                    <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center px-4 transition-all duration-200 animate-in fade-in slide-in-from-top-2">
                        <div className="pointer-events-auto w-max max-w-full">
                            <PlaybackGateCard
                                state={gateCopy.state}
                                title={gateCopy.title}
                                description={gateCopy.description}
                                detail={gateCopy.detail}
                                primaryAction={gateCopy.primaryAction}
                                secondaryAction={gateCopy.secondaryAction}
                            />
                        </div>
                    </div>
                ) : null}
            </CardContent>
        </Card>
    );
}));

VideoPreviewPanel.displayName = 'VideoPreviewPanel';
