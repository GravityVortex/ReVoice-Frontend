"use client";

import React, { useState, useEffect, forwardRef } from 'react';
import { Play, Pause, RefreshCw, Save, ArrowDownToDot, Sparkles, Wand2, Zap, Stars, Cpu, Bot, Rocket, Lightbulb, Pencil, Layers, Package, RedoDot, MoveRight } from 'lucide-react';
import { Textarea } from '@/shared/components/ui/textarea';
import { cn } from '@/shared/lib/utils';

export interface SubtitleRowData {
    id: string;
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
}

interface SubtitleRowItemProps {
    item: SubtitleRowData;
    isSelected: boolean;
    isPlayingSource: boolean;
    isDoubleClick?: boolean;
    isPlayingConvert: boolean;
    isPlayingFromVideo?: boolean; // 左侧视频编辑器正在播放此字幕
    onSelect: () => void;
    onUpdate: (item: SubtitleRowData) => void;
    onPlayPauseSource: () => void;
    onPlayPauseConvert: () => void;
    onPointerToPlaceClick?: () => void;
    onConvert: (item: SubtitleRowData, type: string) => void;
    onSave: (type: string) => void;
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
        const [localItem, setLocalItem] = useState(item);

        useEffect(() => {
            setLocalItem(item);
        }, [item]);

        const handleFieldChange = (field: keyof SubtitleRowData, value: string) => {
            // console.log('handleFieldChange--->', field, value);
            const updatedItem = { ...localItem, [field]: value };
            setLocalItem(updatedItem);
            onUpdate(updatedItem);
        };

        return (
            <div
                ref={ref}
                onClick={onSelect}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    // 点击后左侧面板红色指针定位到该字幕开始位置
                    onPointerToPlaceClick?.();
                }}
                className={cn(
                    "border rounded-lg p-4 cursor-pointer transition-all bg-card",
                    (isDoubleClick || isPlayingFromVideo)
                        ? "border-red-500 bg-primary/50 shadow-lg ring-2 ring-red-500/50"
                        : isSelected
                            ? "border-primary bg-primary/5 shadow-md"
                            : "border-border hover:border-primary/50 hover:bg-accent/50"
                )}
            >
                <div className="flex gap-1 items-center">
                    {/* 左侧：原字幕 */}
                    <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-1 justify-between">
                            {/* 标题行：原字幕【时间】+ 播放图标 */}
                            <div className="flex w-full items-center gap-2">
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onPlayPauseSource();
                                    }}
                                    className={cn(
                                        "cursor-pointer transition-colors p-1 rounded hover:bg-accent border border-border",
                                        isPlayingSource && "text-primary"
                                    )}
                                >
                                    {isPlayingSource ? (
                                        <Pause className="w-5 h-5" />
                                    ) : (
                                        <Play className="w-5 h-5" />
                                    )}
                                </div>
                                <div className="grow text-sm font-semibold text-foreground">
                                    {/* <div>原字幕</div> */}
                                    <div>{localItem.startTime_source} - {localItem.endTime_source}</div>
                                </div>
                            </div>
                        </div>

                        {/* 文本框：可编辑，右下角悬浮图标 */}
                        <div className="relative">
                            {/* 文本框：可编辑 readOnly*/}
                            <Textarea
                                value={localItem.text_source}
                                placeholder="原字幕内容"
                                onChange={(e) => handleFieldChange('text_source', e.target.value)}
                                rows={3}
                                className="resize-none bg-muted/50 cursor-default"
                                onClick={(e) => e.stopPropagation()}
                            />
                        </div>
                    </div>

                    {/* 中间翻译按钮 */}
                    <div className='mt-8'>
                        <div
                            className="ml-0.5 text-center align-middle h-7 cursor-pointer transition-colors p-1 rounded hover:bg-accent"
                            title="重新翻译字幕">
                            <MoveRight className="w-4 h-4" />

                        </div>
                        <div
                            onClick={(e) => {
                                e.stopPropagation();
                                onConvert(localItem, 'gen_srt');
                            }}
                            className="align-middle h-7 cursor-pointer transition-colors p-1 rounded hover:bg-accent border border-border"
                            title="重新翻译字幕">
                            <RedoDot className="w-4 h-4" />
                        </div>
                    </div>

                    {/* 右侧：转换后字幕 */}
                    <div className="flex-1 space-y-3">
                        {/* 标题行：转换后字幕【时间】+ 播放图标 */}
                        <div className="flex items-center justify-between">
                            <div className="flex w-full items-center gap-2">
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onPlayPauseConvert();
                                    }}
                                    className={cn(
                                        "cursor-pointer transition-colors p-1 rounded hover:bg-accent border border-border ",
                                        isPlayingConvert && "text-primary"
                                    )}>
                                    {isPlayingConvert ? (
                                        <Pause className="w-5 h-5" />
                                    ) : (
                                        <Play className="w-5 h-5" />
                                    )}
                                </div>
                                <div className="grow text-sm font-semibold text-foreground">
                                    {/* <div>转换后字幕</div> */}
                                    <div>{localItem.startTime_convert} - {localItem.endTime_convert}</div>
                                </div>
                            </div>
                            <div
                                onClick={(e) => {
                                    if (!localItem.audioUrl_convert_custom) return;
                                    e.stopPropagation();
                                    onSave('translate_srt');
                                }}
                                className={cn(
                                    "p-1.5 min-w-7",
                                    localItem.audioUrl_convert_custom
                                        ? "rounded bg-background/80 border border-border transition-colors cursor-pointer hover:bg-accent"
                                        : "opacity-50 cursor-not-allowed"
                                )}
                                title="保存字幕语音"
                            >
                                {localItem.audioUrl_convert_custom && (<Save className="w-4 h-4" />)}
                            </div>

                        </div>

                        {/* 文本框：可编辑，右下角悬浮图标 */}
                        <div className="relative">
                            <Textarea
                                value={localItem.text_convert}
                                onChange={(e) => handleFieldChange('text_convert', e.target.value)}
                                placeholder="转换后字幕内容"
                                rows={3}
                                className="resize-none pr-16"
                                onClick={(e) => e.stopPropagation()}
                            />
                            {/* 右下角悬浮图标 */}
                            <div className="absolute bottom-2 right-2 flex gap-1">
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onConvert(localItem, 'translate_srt');
                                    }}
                                    className="cursor-pointer p-1.5 rounded bg-background/80 hover:bg-accent transition-colors"
                                    title="更新字幕语音"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                    {/* <Sparkles className="w-4 h-4" /> */}

                                </div>

                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    });
