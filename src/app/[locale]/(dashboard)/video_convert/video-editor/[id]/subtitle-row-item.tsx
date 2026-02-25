"use client";

import React, { useEffect, useMemo, useState, forwardRef } from 'react';
import { Loader2, Pause, Play, RedoDot, RefreshCw, Save, Sparkles, Activity } from 'lucide-react';
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
                    "group relative rounded-xl border px-3 py-2.5 transition-colors",
                    "bg-white/[0.02] border-white/10 hover:bg-white/[0.03]",
                    (isDoubleClick || isPlayingFromVideo)
                        ? "border-primary/45 bg-primary/5 shadow-[0_0_0_1px_rgba(167,139,250,0.18),0_18px_45px_rgba(0,0,0,0.35)]"
                        : isSelected
                            ? "border-primary/35 bg-primary/5"
                            : null
                )}
            >
                {/* A tiny index marker: helps orient in long lists, but stays subtle. */}
                <div
                    aria-hidden
                    className={cn(
                        'pointer-events-none absolute left-3 top-2.5 font-mono text-[10px] tabular-nums',
                        isSelected || isPlayingFromVideo ? 'text-primary/70' : 'text-muted-foreground/50'
                    )}
                >
                    {(localItem.order + 1).toString().padStart(3, '0')}
                </div>

                <div className="grid grid-cols-[minmax(0,1fr)_128px_minmax(0,1fr)] items-start gap-2 pl-10">
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

                            <TimePill time={timeSource} tone={isPlayingFromVideo ? 'active' : 'muted'} />
                        </div>

                        <div className="mt-1 min-w-0 text-[12px] leading-snug text-foreground/90">
                            {isSelected ? (
                                <Textarea
                                    value={localItem.text_source}
                                    placeholder={t('placeholder.original')}
                                    onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => handleFieldChange('text_source', e.target.value)}
                                    rows={4}
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

                    {/* Actions (minimal, centered). */}
                    <div className="flex flex-col items-stretch gap-1.5 pt-0.5">
                        <button
                            type="button"
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                if (isRowBusy) return;
                                e.stopPropagation();
                                onConvert(localItem, 'gen_srt');
                            }}
                            disabled={isRowBusy && convertingType !== 'gen_srt'}
                            className={cn(
                                'group/action relative inline-flex h-8 w-full items-center justify-between rounded-lg border px-2 overflow-hidden',
                                'transition-all duration-300',
                                convertingType === 'gen_srt'
                                    ? 'border-primary/50 bg-primary/10 text-primary shadow-[0_0_12px_rgba(167,139,250,0.15)] ring-1 ring-primary/20 cursor-wait'
                                    : 'border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground',
                                isSelected && convertingType !== 'gen_srt' ? 'opacity-100' : (convertingType === 'gen_srt' ? 'opacity-100' : 'opacity-85'),
                                isRowBusy && convertingType !== 'gen_srt' ? 'opacity-40 cursor-not-allowed' : null
                            )}
                            title={t('tooltips.retranslateWithCost', { credits: 1 })}
                            aria-label={t('tooltips.retranslateWithCost', { credits: 1 })}
                        >
                            {convertingType === 'gen_srt' && (
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-primary/10 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
                            )}
                            <span className="relative z-10 inline-flex items-center gap-1.5 text-[11px] font-medium">
                                {convertingType === 'gen_srt' ? (
                                    <Sparkles className="size-4 animate-pulse text-primary drop-shadow-[0_0_8px_rgba(167,139,250,0.8)]" />
                                ) : (
                                    <RedoDot className="size-4" />
                                )}
                                {t('actions.retranslate')}
                            </span>

                            {convertingType === 'gen_srt' ? (
                                <span className="relative z-10 inline-flex items-center space-x-0.5">
                                    <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                    <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                    <span className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                                </span>
                            ) : (
                                <span
                                    aria-hidden
                                    className="relative z-10 rounded-md border border-white/10 bg-muted/70 px-1.5 py-0.5 text-[10px] font-mono tabular-nums text-muted-foreground/90"
                                >
                                    1
                                </span>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                if (isRowBusy) return;
                                e.stopPropagation();
                                onConvert(localItem, 'translate_srt');
                            }}
                            disabled={isRowBusy && convertingType !== 'translate_srt'}
                            className={cn(
                                'group/action relative inline-flex h-8 w-full items-center justify-between rounded-lg border px-2 overflow-hidden',
                                'transition-all duration-300',
                                convertingType === 'translate_srt'
                                    ? 'border-sky-500/50 bg-sky-500/10 text-sky-400 shadow-[0_0_12px_rgba(14,165,233,0.15)] ring-1 ring-sky-500/20 cursor-wait'
                                    : 'border-white/10 bg-white/[0.03] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground',
                                isRowBusy && convertingType !== 'translate_srt' ? 'opacity-40 cursor-not-allowed' : null
                            )}
                            title={t('tooltips.updateVoiceWithCost', { credits: 2 })}
                            aria-label={t('tooltips.updateVoiceWithCost', { credits: 2 })}
                        >
                            {convertingType === 'translate_srt' && (
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-sky-500/10 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
                            )}
                            <span className="relative z-10 inline-flex items-center gap-1.5 text-[11px] font-medium">
                                {convertingType === 'translate_srt' ? (
                                    <Activity className="size-4 animate-pulse text-sky-400 drop-shadow-[0_0_8px_rgba(14,165,233,0.8)]" />
                                ) : (
                                    <RefreshCw className="size-4" />
                                )}
                                {t('actions.regenVoice')}
                            </span>

                            {convertingType === 'translate_srt' ? (
                                <span className="relative z-10 inline-flex items-center space-x-0.5">
                                    <span className="w-1 h-1 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                                    <span className="w-1 h-1 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                                    <span className="w-1 h-1 bg-sky-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                                </span>
                            ) : (
                                <span
                                    aria-hidden
                                    className="relative z-10 rounded-md border border-white/10 bg-muted/70 px-1.5 py-0.5 text-[10px] font-mono tabular-nums text-muted-foreground/90"
                                >
                                    2
                                </span>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                                if (isRowBusy || !localItem.audioUrl_convert_custom) return;
                                e.stopPropagation();
                                onSave('translate_srt');
                            }}
                            disabled={isRowBusy || !localItem.audioUrl_convert_custom}
                            className={cn(
                                'inline-flex h-8 w-full items-center justify-center rounded-lg border px-2 transition-colors',
                                localItem.audioUrl_convert_custom && !isRowBusy
                                    ? 'border-white/10 bg-primary/10 text-primary hover:bg-primary/15'
                                    : 'border-white/10 bg-white/[0.02] text-muted-foreground/40 cursor-not-allowed',
                                isSaving ? 'cursor-wait' : null
                            )}
                            title={t('tooltips.saveVoice')}
                            aria-label={t('tooltips.saveVoice')}
                        >
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium">
                                {isSaving ? (
                                    <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
                                ) : (
                                    <Save className="size-4" />
                                )}
                                {t('actions.applyVoice')}
                            </span>
                        </button>
                    </div>

                    {/* Converted */}
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 justify-end">
                            <TimePill time={timeConvert} tone={isPlayingFromVideo ? 'active' : 'muted'} />
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
                                    rows={4}
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
