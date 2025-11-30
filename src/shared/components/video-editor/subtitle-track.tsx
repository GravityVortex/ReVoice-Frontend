"use client";

import React, { useState, useCallback, useEffect } from 'react';
import { Plus, Type, Trash2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';
import { SubtitleTrackItem } from './types';

interface SubtitleTrackProps {
  items: SubtitleTrackItem[];
  onAddItem: () => void;
  totalDuration: number;
  zoom: number;
  selectedItem?: string;
  onSelectItem: (id: string) => void;
  onUpdateItem: (id: string, updates: Partial<SubtitleTrackItem>) => void;
  onDeleteItem: (id: string) => void;
  className?: string;
  hideLabel?: boolean;
}

export function SubtitleTrack({
  items,
  onAddItem,
  totalDuration,
  zoom,
  selectedItem,
  onSelectItem,
  onUpdateItem,
  onDeleteItem,
  className,
  hideLabel = false
}: SubtitleTrackProps) {
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [dragType, setDragType] = useState<'move' | 'resize-left' | 'resize-right' | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, startTime: 0, duration: 0 });

  // 处理鼠标按下事件
  const handleMouseDown = useCallback((e: React.MouseEvent, itemId: string, type: 'move' | 'resize-left' | 'resize-right') => {
    e.preventDefault();
    e.stopPropagation();
    
    const item = items.find(i => i.id === itemId);
    if (!item) return;

    setDragItem(itemId);
    setDragType(type);
    setDragStart({ 
      x: e.clientX, 
      startTime: item.startTime,
      duration: item.duration
    });
    onSelectItem(itemId);
  }, [items, onSelectItem]);

  // 处理鼠标移动事件
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragItem || !dragType) return;

    const deltaX = e.clientX - dragStart.x;
    // 获取轨道容器的实际宽度来精确计算时间偏移
    const trackContainer = document.getElementById('unified-scroll-container');
    const trackWidth = trackContainer ? trackContainer.clientWidth : window.innerWidth * 0.6;
    const deltaTime = (deltaX / trackWidth) * totalDuration / zoom;
    
    const item = items.find(i => i.id === dragItem);
    if (!item) return;

    switch (dragType) {
      case 'move': {
        let newStartTime = Math.max(0, dragStart.startTime + deltaTime);
        const maxStartTime = Math.max(0, totalDuration - item.duration);
        newStartTime = Math.min(newStartTime, maxStartTime);
        // 添加网格吸附功能，每0.5秒为一个吸附点，让拖动更精确
        const snapInterval = 0.5;
        newStartTime = Math.round(newStartTime / snapInterval) * snapInterval;
        onUpdateItem(dragItem, {
          startTime: newStartTime
        });
        break;
      }
      case 'resize-left': {
        const newStartTime = Math.max(0, dragStart.startTime + deltaTime);
        const maxStartTime = dragStart.startTime + dragStart.duration - 0.1;
        const clampedStartTime = Math.min(newStartTime, maxStartTime);
        const newDuration = dragStart.duration - (clampedStartTime - dragStart.startTime);
        
        if (newDuration > 0.1) {
          onUpdateItem(dragItem, {
            startTime: clampedStartTime,
            duration: newDuration
          });
        }
        break;
      }
      case 'resize-right': {
        const newDuration = Math.max(0.1, dragStart.duration + deltaTime);
        const maxDuration = totalDuration - dragStart.startTime;
        onUpdateItem(dragItem, {
          duration: Math.min(newDuration, maxDuration)
        });
        break;
      }
    }
  }, [dragItem, dragType, dragStart, totalDuration, zoom, items, onUpdateItem]);

  // 处理鼠标释放事件
  const handleMouseUp = useCallback(() => {
    setDragItem(null);
    setDragType(null);
  }, []);

  // 添加全局事件监听器
  useEffect(() => {
    if (dragItem) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragItem, handleMouseMove, handleMouseUp]);

  // 处理双击删除
  const handleDoubleClick = (itemId: string) => {
    if (confirm('确定要删除这个字幕吗？')) {
      onDeleteItem(itemId);
    }
  };

  // 渲染轨道项目的函数
  const renderTrackItems = () => (
    <>
      {/* 网格线 */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: Math.ceil(totalDuration / 5) + 1 }, (_, i) => (
          <div
            key={i}
            className="absolute top-0 h-full border-l border-gray-700 opacity-30"
            style={{ left: `${(i * 5 / totalDuration) * 100}%` }}
          />
        ))}
      </div>

      {/* 字幕项目 */}
      {items.map(item => {
        const leftPercent = (item.startTime / totalDuration) * 100;
        const widthPercent = (item.duration / totalDuration) * 100;
        const isSelected = selectedItem === item.id;
        
        return (
          <div
            key={item.id}
            className={cn(
              "absolute top-1 h-14 rounded cursor-pointer border-2 flex items-center px-2 transition-all duration-200 hover:brightness-110",
              "bg-yellow-600 border-yellow-500",
              isSelected ? "border-yellow-400 shadow-lg shadow-yellow-400/30" : "border-transparent",
              dragItem === item.id ? "z-10" : "z-0"
            )}
            style={{
              left: `${leftPercent}%`,
              width: `${Math.max(widthPercent, 2)}%`,
              minWidth: '40px'
            }}
            onMouseDown={(e) => handleMouseDown(e, item.id, 'move')}
            onDoubleClick={() => handleDoubleClick(item.id)}
            title={`${item.text} (${item.startTime.toFixed(1)}s - ${(item.startTime + item.duration).toFixed(1)}s)`}
          >
            {/* 左侧调整手柄 */}
            <div
              className="absolute left-0 top-0 w-2 h-full bg-purple-500/20 cursor-ew-resize opacity-0 hover:opacity-100 transition-opacity"
              onMouseDown={(e) => {
                e.stopPropagation();
                handleMouseDown(e, item.id, 'resize-left');
              }}
              title="调整开始时间"
            >
              <div className="absolute left-1 top-1/2 transform -translate-y-1/2 w-0.5 h-8 bg-purple-400 rounded-full opacity-80" />
            </div>

            {/* 字幕内容 */}
            <div className="flex-1 flex items-center justify-between min-w-0">
              <span className="text-white text-sm font-medium truncate">{item.text}</span>
              <span className="text-white/70 text-xs ml-2 shrink-0">
                {item.duration.toFixed(1)}s
              </span>
            </div>

            {/* 右侧调整手柄 */}
            <div
              className="absolute right-0 top-0 w-2 h-full bg-purple-500/20 cursor-ew-resize opacity-0 hover:opacity-100 transition-opacity"
              onMouseDown={(e) => {
                e.stopPropagation();
                handleMouseDown(e, item.id, 'resize-right');
              }}
              title="调整持续时间"
            >
              <div className="absolute right-0.5 top-1/2 transform -translate-y-1/2 w-0.5 h-8 bg-purple-400 rounded-full opacity-80" />
            </div>
          </div>
        );
      })}

      {/* 空轨道提示 */}
      {items.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm pointer-events-none">
          {hideLabel ? "字幕轨道内容" : "点击 + 添加字幕"}
        </div>
      )}
    </>
  );

  if (hideLabel) {
    // 只显示轨道内容，不显示标签
    return (
      <div className={cn("h-16 bg-gray-800 border-b border-gray-700 relative", className)} style={{ zIndex: 1 }}>
        <div 
          className="relative h-full bg-gray-850 bg-gray-800" 
          style={{ 
            width: `${Math.max(100 * zoom, 100)}%`,
            minWidth: '100%'
          }}
        >
          {renderTrackItems()}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("h-16 bg-gray-800 border-b border-gray-700 flex relative", className)} style={{ zIndex: 1 }}>
      {/* 轨道标签 */}
      <div className="w-32 flex items-center justify-between px-3 bg-gray-750 border-r border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white">字幕</span>
          <Type className="w-3 h-3 text-gray-400" />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onAddItem}
          className="w-6 h-6 p-0 text-gray-400 hover:text-white hover:bg-gray-600"
          title="添加字幕"
        >
          <Plus className="w-3 h-3" />
        </Button>
      </div>
      
      {/* 轨道内容区域 */}
      <div className="flex-1 relative bg-gray-850" style={{ zIndex: 0 }}>
        <div 
          className="relative h-full" 
          style={{ 
            width: `${100 * zoom}%`,
            minWidth: '100%' // 确保至少占满容器宽度
          }}
        >
          {renderTrackItems()}
        </div>
      </div>
    </div>
  );
}
