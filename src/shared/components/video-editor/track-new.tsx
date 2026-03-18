"use client";

import React, { memo } from 'react';
import { cn } from '@/shared/lib/utils';
import { TrackItem } from './types';

interface TrackProps {
  title: string;
  items: TrackItem[];
  onAddItem?: () => void;
  totalDuration: number;
  selectedItem?: string;
  onSelectItem?: (id: string) => void;
  onUpdateItem?: (id: string, updates: Partial<TrackItem>) => void;
  onDeleteItem?: (id: string) => void;
  className?: string;
}

export const Track = memo(function Track({
  title,
  items,
  totalDuration,
  selectedItem,
  className,
}: TrackProps) {
  const safeTotalDuration = Math.max(0.001, totalDuration);

  const minorStepSeconds = 5;
  const majorStepSeconds = 15;
  const minorStepPct = Math.min(100, (minorStepSeconds / safeTotalDuration) * 100);
  const majorStepPct = Math.min(100, (majorStepSeconds / safeTotalDuration) * 100);

  // 获取轨道颜色
  const getTrackColor = (type: string) => {
    switch (type) {
      case 'video': return 'bg-white/15 border-white/10';
      case 'audio': return 'bg-emerald-600/60 border-emerald-400/40';
      case 'bgm': return 'bg-white/12 border-white/8';
      default: return 'bg-slate-600/60 border-slate-400/40';
    }
  };

  return (
    <div
      className={cn(
        'h-16 bg-muted/40 relative',
        className
      )}
    >
      {/* Grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(148, 163, 184, 0.18) 1px, transparent 1px), linear-gradient(to right, rgba(148, 163, 184, 0.30) 1px, transparent 1px)',
          backgroundSize: `${minorStepPct}% 100%, ${majorStepPct}% 100%`,
          backgroundRepeat: 'repeat',
        }}
      />

      {/* Items */}
      {items.map((item) => {
        const leftPercent = (item.startTime / safeTotalDuration) * 100;
        const widthPercent = (item.duration / safeTotalDuration) * 100;
        const isSelected = selectedItem === item.id;

        return (
          <div
            key={item.id}
            className={cn(
              'absolute top-1 h-14 rounded-lg cursor-pointer border flex items-center px-2 transition-colors hover:brightness-110',
              getTrackColor(item.type),
              isSelected ? 'border-yellow-400 shadow-lg shadow-yellow-400/20' : null
            )}
            style={{
              left: `${leftPercent}%`,
              width: `${Math.max(widthPercent, 2)}%`,
              minWidth: '40px',
            }}
          >
            <div className="flex-1 flex items-center justify-between min-w-0">
              <span className="text-white text-sm font-medium truncate">
                {item.name}
              </span>
              <span className="text-white/70 text-xs ml-2 shrink-0">
                {item.duration.toFixed(1)}s
              </span>
            </div>
          </div>
        );
      })}

      {items.length === 0 ? (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm pointer-events-none">
          {title}
        </div>
      ) : null}
    </div>
  );
});

Track.displayName = 'Track';
