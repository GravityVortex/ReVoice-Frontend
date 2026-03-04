"use client";

import React, { useEffect, useMemo, useState, forwardRef } from 'react';
import { Loader2, Pause, Play, RedoDot, RefreshCw, Save, Sparkles, Activity, Languages, AudioLines } from 'lucide-react';
import { Textarea } from '@/shared/components/ui/textarea';
import { cn } from '@/shared/lib/utils';
import { useTranslations } from 'next-intl';

export interface SubtitleRowData {
    // Stable ordering for linking with timeline/video (0-based).
    order: number;
    // Translated segment id (used for merge + translated voice filenames).
    id: string;
    // Original segment id (used for original voice filenames).
    sourceId: string;

    startTime_source: string;
    endTime_source: string;
    text_source: string;
    audioUrl_source: string;
    audioUrl_source_custom?: string;// 调用python临时生成的音频

    startTime_convert: string;
    endTime_convert: string;
    text_convert: string;
    audioUrl_convert: string;
    audioUrl_convert_custom?: string;// 调用python临时生成的音频
    newTime: string;// 保存后添加时间戳，以便获取同url新音频
}

interface SubtitleRowItemProps {
    item: SubtitleRowData;
    isSelected: boolean;
    isPlayingSource: boolean;
    isDoubleClick?: boolean;
    isPlayingConvert: boolean;
    isPlayingFromVideo?: boolean; // 左侧视频编辑器正在播放此字幕
    convertingType?: string | null; // 正在生成语音/翻译
    isSaving?: boolean; // 正在应用配音（保存到后端）
    onSelect: () => void;
    onUpdate: (item: SubtitleRowData) => void;
    onPlayPauseSource: () => void;
    onPlayPauseConvert: () => void;
    onPointerToPlaceClick?: () => void;
    onConvert: (item: SubtitleRowData, type: string) => void;
    onSave: (type: string) => void;
}

function TimePill({
    time,
    tone = 'muted',
}: {
    time: string;
    tone?: 'muted' | 'active';
}) {
    return (
        <span
            className={cn(
                'inline-flex items-center rounded-md border px-2 py-0.5',
                'text-[10px] font-mono tabular-nums',
                tone === 'active'
                    ? 'border-primary/25 bg-primary/10 text-primary/90'
                    : 'border-white/10 bg-white/[0.03] text-muted-foreground/80'
            )}
        >
            {time}
        </span>
    );
}

export const SubtitleRowItem = forwardRef<HTMLDivElement, SubtitleRowItemProps>(
    function SubtitleRowItem(
        {
            item,
            isSelected,
            isDoubleClick = false,
            isPlayingSource,
            isPlayingConvert,
            isPlayingFromVideo = false,
            convertingType = null,
            isSaving = false,
            onSelect,
            onUpdate,
            onPlayPauseSource,
            onPlayPauseConvert,
            onConvert,
            onSave,
            onPointerToPlaceClick,
        },
        ref
    ) {
        const t = useTranslations('video_convert.videoEditor.subtitleRow');
        const [localItem, setLocalItem] = useState(item);
        const isRowBusy = !!convertingType || isSaving;
        const isAudioPlaying = isPlayingSource || isPlayingConvert;

        useEffect(() => {
            setLocalItem(item);
        }, [item]);

        const timeSource = useMemo(() => `${localItem.startTime_source} → ${localItem.endTime_source}`, [localItem.endTime_source, localItem.startTime_source]);
        const timeConvert = useMemo(() => `${localItem.startTime_convert} → ${localItem.endTime_convert}`, [localItem.endTime_convert, localItem.startTime_convert]);

        const handleFieldChange = (field: keyof SubtitleRowData, value: string) => {
            // console.log('handleFieldChange--->', field, value);
            const updatedItem = { ...localItem, [field]: value };
            setLocalItem(updatedItem);
            onUpdate(updatedItem);
        };

        return (
            <div
                ref={ref}
                aria-busy={isRowBusy}
                onClick={onSelect}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    // 点击后左侧面板红色指针定位到该字幕开始位置
                    onPointerToPlaceClick?.();
                }}
                className={cn(
                    "group relative rounded-lg border px-3 py-1.5 transition-colors",
                    "bg-white/[0.02] border-white/10 hover:bg-white/[0.03]",
                    (isDoubleClick || isPlayingFromVideo)
                        ? "border-primary/45 bg-primary/5 shadow-[0_0_0_1px_rgba(167,139,250,0.18),0_18px_45px_rgba(0,0,0,0.35)]"
                        : isAudioPlaying
                            ? "border-primary/40 bg-primary/5 shadow-[0_0_0_1px_rgba(167,139,250,0.14),0_14px_40px_rgba(0,0,0,0.32)]"
                            : isSelected
                                ? "border-primary/35 bg-primary/5"
                                : null,
                    isPlayingSource
                        ? "before:content-[''] before:pointer-events-none before:absolute before:inset-y-2 before:left-1 before:w-1 before:rounded-full before:bg-gradient-to-b before:from-primary/80 before:via-primary/35 before:to-transparent before:animate-pulse"
                        : null,
                    isPlayingConvert
                        ? "after:content-[''] after:pointer-events-none after:absolute after:inset-y-2 after:right-1 after:w-1 after:rounded-full after:bg-gradient-to-b after:from-primary/80 after:via-primary/35 after:to-transparent after:animate-pulse"
                        : null
                )}
            >
                {/* A tiny index marker: helps orient in long lists, but stays subtle. */}
                <div
                    aria-hidden
                    className={cn(
                        'pointer-events-none absolute left-2 top-1.5 font-mono text-[10px] tabular-nums',
                        isAudioPlaying || isSelected || isPlayingFromVideo ? 'text-primary/80' : 'text-muted-foreground/50'
                    )}
                >
                    {(localItem.order + 1).toString().padStart(3, '0')}
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)] items-start gap-4 pl-10">
                    {/* Original */}
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                    e.stopPropagation();
                                    onPlayPauseSource();
                                }}
                                className={cn(
                                    'inline-flex size-7 items-center justify-center rounded-md border',
                                    'border-white/10 bg-white/[0.03] text-muted-foreground',
                                    'transition-colors hover:bg-white/[0.06] hover:text-foreground',
                                    isPlayingSource ? 'text-primary border-primary/30 bg-primary/10' : null
                                )}
                                aria-label={t('tooltips.playOriginal')}
                                title={t('tooltips.playOriginal')}
                            >
                                {isPlayingSource ? <Pause className="size-4" /> : <Play className="size-4" />}
                            </button>

                            <TimePill time={timeSource} tone={isPlayingFromVideo || isPlayingSource ? 'active' : 'muted'} />
                        </div>

                        <div className="mt-1 min-w-0 text-[12px] leading-snug text-foreground/90">
                            {isSelected ? (
                                <Textarea
                                    value={localItem.text_source}
                                    placeholder={t('placeholder.original')}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleFieldChange('text_source', e.target.value)}
                                    rows={2}
                                    className="resize-none bg-black/10 border-white/10 focus-visible:ring-primary/30"
                                    onClick={(e: React.MouseEvent<HTMLTextAreaElement>) => e.stopPropagation()}
                                />
                            ) : (
                                <div className="line-clamp-2 text-foreground/90">
                                    {localItem.text_source || (
                                        <span className="text-muted-foreground/70">{t('placeholder.original')}</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Actions (Ultra-minimal icon dock). */}
                    <div className="flex flex-col items-center justify-start pt-1 z-20">
                        <div className={cn(
                            "flex flex-col items-center gap-1.5 p-1 rounded-full border transition-all duration-300",
                            (isSelected || isRowBusy || localItem.audioUrl_convert_custom)
                                ? "border-white/10 bg-black/40 shadow-xl opacity-100"
                                : "border-transparent bg-transparent opacity-40 group-hover:opacity-100 group-hover:border-white/5 group-hover:bg-black/20"
                        )}>
                            {/* Retranslate — Languages icon with purple tint */}
                            <button
                                type="button"
                                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                    if (isRowBusy) return;
                                    e.stopPropagation();
                                    onConvert(localItem, 'gen_srt');
                                }}
                                disabled={isRowBusy && convertingType !== 'gen_srt'}
                                className={cn(
                                    "relative flex size-7 items-center justify-center rounded-full transition-all duration-300",
                                    convertingType === 'gen_srt'
                                        ? "bg-primary/20 text-primary shadow-[0_0_10px_rgba(167,139,250,0.3)] cursor-wait"
                                        : "text-violet-400/70 hover:bg-violet-500/15 hover:text-violet-300",
                                    isRowBusy && convertingType !== 'gen_srt' ? "opacity-30 cursor-not-allowed" : ""
                                )}
                                title={t('tooltips.retranslateWithCost', { credits: 1 })}
                                aria-label={t('tooltips.retranslateWithCost', { credits: 1 })}
                            >
                                {convertingType === 'gen_srt' ? (
                                    <Sparkles className="size-3.5 animate-pulse" />
                                ) : (
                                    <Languages className="size-4" />
                                )}
                            </button>

                            {/* Divider line */}
                            <div className="w-4 h-px bg-white/10 rounded-full" />

                            {/* Regen Voice — AudioLines icon with teal tint */}
                            <button
                                type="button"
                                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                    if (isRowBusy) return;
                                    e.stopPropagation();
                                    onConvert(localItem, 'translate_srt');
                                }}
                                disabled={isRowBusy && convertingType !== 'translate_srt'}
                                className={cn(
                                    "relative flex size-7 items-center justify-center rounded-full transition-all duration-300",
                                    convertingType === 'translate_srt'
                                        ? "bg-sky-500/20 text-sky-400 shadow-[0_0_10px_rgba(14,165,233,0.3)] cursor-wait"
                                        : "text-teal-400/70 hover:bg-teal-500/15 hover:text-teal-300",
                                    isRowBusy && convertingType !== 'translate_srt' ? "opacity-30 cursor-not-allowed" : ""
                                )}
                                title={t('tooltips.updateVoiceWithCost', { credits: 2 })}
                                aria-label={t('tooltips.updateVoiceWithCost', { credits: 2 })}
                            >
                                {convertingType === 'translate_srt' ? (
                                    <Activity className="size-3.5 animate-pulse" />
                                ) : (
                                    <AudioLines className="size-4" />
                                )}
                            </button>

                            {/* Divider line (only show if Save is relevant/visible) */}
                            {localItem.audioUrl_convert_custom && (
                                <>
                                    <div className="w-4 h-px bg-white/10 rounded-full" />
                                    <button
                                        type="button"
                                        onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                            if (isRowBusy) return;
                                            e.stopPropagation();
                                            onSave('translate_srt');
                                        }}
                                        disabled={isRowBusy || !localItem.audioUrl_convert_custom}
                                        className={cn(
                                            "relative flex size-7 items-center justify-center rounded-full transition-all duration-300",
                                            "bg-primary/20 text-primary hover:bg-primary/30 hover:scale-110",
                                            isSaving ? "cursor-wait" : ""
                                        )}
                                        title={t('tooltips.saveVoice')}
                                        aria-label={t('tooltips.saveVoice')}
                                    >
                                        {isSaving ? (
                                            <Loader2 className="size-3.5 animate-spin" />
                                        ) : (
                                            <Save className="size-3.5" />
                                        )}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Converted */}
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 justify-end">
                            <TimePill time={timeConvert} tone={isPlayingFromVideo || isPlayingConvert ? 'active' : 'muted'} />
                            <button
                                type="button"
                                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                    e.stopPropagation();
                                    onPlayPauseConvert();
                                }}
                                className={cn(
                                    'inline-flex size-7 items-center justify-center rounded-md border',
                                    'border-white/10 bg-white/[0.03] text-muted-foreground',
                                    'transition-colors hover:bg-white/[0.06] hover:text-foreground',
                                    isPlayingConvert ? 'text-primary border-primary/30 bg-primary/10' : null
                                )}
                                aria-label={t('tooltips.playConverted')}
                                title={t('tooltips.playConverted')}
                            >
                                {isPlayingConvert ? <Pause className="size-4" /> : <Play className="size-4" />}
                            </button>
                        </div>

                        <div className="mt-1 min-w-0 text-[12px] leading-snug text-foreground/90">
                            {isSelected ? (
                                <Textarea
                                    value={localItem.text_convert}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleFieldChange('text_convert', e.target.value)}
                                    placeholder={t('placeholder.converted')}
                                    rows={2}
                                    className="resize-none bg-black/10 border-white/10 focus-visible:ring-primary/30"
                                    onClick={(e: React.MouseEvent<HTMLTextAreaElement>) => e.stopPropagation()}
                                />
                            ) : (
                                <div className="line-clamp-2 text-right">
                                    {localItem.text_convert || (
                                        <span className="text-muted-foreground/70">{t('placeholder.converted')}</span>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    });
