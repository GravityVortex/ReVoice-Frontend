"use client";

import React, { useState, useEffect, forwardRef } from 'react';
import { Play, Pause, RefreshCw, Save } from 'lucide-react';
import { Textarea } from '@/shared/components/ui/textarea';
import { cn } from '@/shared/lib/utils';

export interface SubtitleComparisonData {
    id: string;
    startTime_source: string;
    endTime_source: string;
    text_source: string;
    audioUrl_source: string;

    startTime_convert: string;
    endTime_convert: string;
    text_convert: string;
    audioUrl_convert: string;
}

interface SubtitleComparisonItemProps {
    item: SubtitleComparisonData;
    isSelected: boolean;
    isPlayingSource: boolean;
    isPlayingConvert: boolean;
    isPlayingFromVideo?: boolean; // 左侧视频编辑器正在播放此字幕
    onSelect: () => void;
    onUpdate: (item: SubtitleComparisonData) => void;
    onPlayPauseSource: () => void;
    onPlayPauseConvert: () => void;
    onConvert: () => void;
    onSave: () => void;
}

export const SubtitleComparisonItem = forwardRef<HTMLDivElement, SubtitleComparisonItemProps>(
    function SubtitleComparisonItem(
        {
            item,
            isSelected,
            isPlayingSource,
            isPlayingConvert,
            isPlayingFromVideo = false,
            onSelect,
            onUpdate,
            onPlayPauseSource,
            onPlayPauseConvert,
            onConvert,
            onSave,
        },
        ref
    ) {
        const [localItem, setLocalItem] = useState(item);

        useEffect(() => {
            setLocalItem(item);
        }, [item]);

        const handleFieldChange = (field: keyof SubtitleComparisonData, value: string) => {
            const updatedItem = { ...localItem, [field]: value };
            setLocalItem(updatedItem);
            onUpdate(updatedItem);
        };

        return (
            <div
                ref={ref}
                onClick={onSelect}
                className={cn(
                    "border rounded-lg p-4 cursor-pointer transition-all",
                    isPlayingFromVideo
                        ? "border-red-500 bg-primary/50 shadow-lg ring-2 ring-red-500/50"
                        : isSelected
                        ? "border-primary bg-primary/5 shadow-md"
                        : "border-border hover:border-primary/50 hover:bg-accent/50"
                )}
            >
                <div className="flex gap-4">
                    {/* 左侧：原字幕 */}
                    <div className="flex-1 space-y-3">
                        <div className="flex items-center gap-1 justify-between">
                            {/* 标题行：原字幕【时间】+ 播放图标 */}
                            <div className="flex items-center gap-1">
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onPlayPauseSource();
                                    }}
                                    className={cn(
                                        "cursor-pointer transition-colors p-1 rounded hover:bg-accent",
                                        isPlayingSource && "text-primary"
                                    )}
                                >
                                    {isPlayingSource ? (
                                        <Pause className="w-5 h-5" />
                                    ) : (
                                        <Play className="w-5 h-5" />
                                    )}
                                </div>
                                <h4 className="text-sm font-semibold text-foreground">
                                    原字幕【{localItem.startTime_source} - {localItem.endTime_source}】
                                </h4>
                            </div>
                        </div>

                        {/* 文本框：不可编辑 */}
                        <Textarea
                            value={localItem.text_source}
                            readOnly
                            rows={3}
                            className="resize-none bg-muted/50 cursor-default"
                            onClick={(e) => e.stopPropagation()}
                        />
                    </div>

                    {/* 右侧：转换后字幕 */}
                    <div className="flex-1 space-y-3">
                        {/* 标题行：转换后字幕【时间】+ 播放图标 */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                                <div
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onPlayPauseConvert();
                                    }}
                                    className={cn(
                                        "cursor-pointer transition-colors p-1 rounded hover:bg-accent",
                                        isPlayingConvert && "text-primary"
                                    )}>
                                    {isPlayingConvert ? (
                                        <Pause className="w-5 h-5" />
                                    ) : (
                                        <Play className="w-5 h-5" />
                                    )}
                                </div>
                                <h4 className="text-sm font-semibold text-foreground">
                                    转换后字幕【{localItem.startTime_convert} - {localItem.endTime_convert}】
                                </h4>
                            </div>
                            <div
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onSave();
                                }}
                                className="cursor-pointer p-1.5 rounded bg-background/80 hover:bg-accent border border-border transition-colors"
                                title="保存"
                            >
                                <Save className="w-4 h-4" />
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
                                        onConvert();
                                    }}
                                    className="cursor-pointer p-1.5 rounded bg-background/80 hover:bg-accent border border-border transition-colors"
                                    title="转换"
                                >
                                    <RefreshCw className="w-4 h-4" />
                                </div>

                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    });
