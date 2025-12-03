"use client";

// 背景音乐、视频轨道共用
import React, { useState, useEffect, useCallback } from 'react';
import { Volume2, Plus } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';
import { TrackItem } from './types';

interface TrackProps {
  title: string;
  items: TrackItem[];
  onAddItem?: () => void;
  totalDuration: number;
  zoom: number;
  selectedItem?: string;
  onSelectItem?: (id: string) => void;
  onUpdateItem?: (id: string, updates: Partial<TrackItem>) => void;
  onDeleteItem?: (id: string) => void;
  className?: string;
}

export function Track({
  title,
  items,
  onAddItem,
  totalDuration,
  zoom,
  selectedItem,
  onSelectItem,
  onUpdateItem,
  onDeleteItem,
  className,
}: TrackProps) {
  const [dragItem, setDragItem] = useState<string | null>(null);
  const [dragType, setDragType] = useState<'move' | 'resize-left' | 'resize-right' | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, startTime: 0, duration: 0 });

  // 获取轨道颜色
  const getTrackColor = (type: string) => {
    switch (type) {
      case 'video': return 'bg-blue-600 border-blue-500';
      case 'audio': return 'bg-green-600 border-green-500';
      case 'bgm': return 'bg-purple-600 border-purple-500';
      default: return 'bg-gray-600 border-gray-500';
    }
  };

  // 处理鼠标按下事件
  // const handleMouseDown = useCallback((e: React.MouseEvent, itemId: string, type: 'move' | 'resize-left' | 'resize-right') => {
  //   e.preventDefault();
  //   setDragItem(itemId);
  //   setDragType(type);

  //   const item = items.find(i => i.id === itemId);
  //   if (item) {
  //     setDragStart({
  //       x: e.clientX,
  //       startTime: item.startTime,
  //       duration: item.duration
  //     });
  //   }

  //   onSelectItem(itemId);
  // }, [items, onSelectItem]);

  // 处理鼠标移动事件
  // const handleMouseMove = useCallback((e: MouseEvent) => {
  //   if (!dragItem || !dragType) return;

  //   const deltaX = e.clientX - dragStart.x;
  //   // 获取轨道容器的实际宽度来精确计算时间偏移
  //   const trackContainer = document.getElementById('unified-scroll-container');
  //   const trackWidth = trackContainer ? trackContainer.clientWidth : window.innerWidth * 0.6;
  //   const deltaTime = (deltaX / trackWidth) * totalDuration / zoom;

  //   switch (dragType) {
  //     case 'move': {
  //       let newStartTime = Math.max(0, Math.min(dragStart.startTime + deltaTime, totalDuration - dragStart.duration));
  //       // 添加网格吸附功能，每0.5秒为一个吸附点，让拖动更精确
  //       const snapInterval = 0.5;
  //       newStartTime = Math.round(newStartTime / snapInterval) * snapInterval;
  //       onUpdateItem(dragItem, { startTime: newStartTime });
  //       break;
  //     }
  //     case 'resize-left': {
  //       const newStartTime = Math.max(0, Math.min(dragStart.startTime + deltaTime, dragStart.startTime + dragStart.duration - 0.1));
  //       const newDuration = dragStart.duration - (newStartTime - dragStart.startTime);
  //       onUpdateItem(dragItem, {
  //         startTime: newStartTime,
  //         duration: newDuration
  //       });
  //       break;
  //     }
  //     case 'resize-right': {
  //       const newDuration = Math.max(0.1, dragStart.duration + deltaTime);
  //       const maxDuration = totalDuration - dragStart.startTime;
  //       onUpdateItem(dragItem, {
  //         duration: Math.min(newDuration, maxDuration)
  //       });
  //       break;
  //     }
  //   }
  // }, [dragItem, dragType, dragStart, totalDuration, zoom, onUpdateItem]);

  // 处理鼠标释放事件
  // const handleMouseUp = useCallback(() => {
  //   setDragItem(null);
  //   setDragType(null);
  // }, []);

  // 添加全局事件监听器
  // useEffect(() => {
  //   if (dragItem) {
  //     document.addEventListener('mousemove', handleMouseMove);
  //     document.addEventListener('mouseup', handleMouseUp);

  //     return () => {
  //       document.removeEventListener('mousemove', handleMouseMove);
  //       document.removeEventListener('mouseup', handleMouseUp);
  //     };
  //   }
  // }, [dragItem, handleMouseMove, handleMouseUp]);

  // 处理双击删除
  // const handleDoubleClick = (itemId: string) => {
  //   if (confirm('确定要删除这个项目吗？')) {
  //     onDeleteItem(itemId);
  //   }
  // };

  // 渲染轨道项目
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

      {/* 轨道项目 */}
      {items.map(item => {
        // debugger;
        const leftPercent = (item.startTime / totalDuration) * 100;
        const widthPercent = (item.duration / totalDuration) * 100;
        const isSelected = selectedItem === item.id;


        return (
          <div
            key={item.id}
            className={cn(
              "absolute top-1 h-14 rounded cursor-pointer border-2 flex items-center px-2 transition-all duration-200 hover:brightness-110",
              getTrackColor(item.type),
              isSelected ? "border-yellow-400 shadow-lg shadow-yellow-400/30" : "border-transparent",
              dragItem === item.id ? "z-10" : "z-0"
            )}
            style={{
              left: `${leftPercent}%`,
              width: `${Math.max(widthPercent, 2)}%`,
              minWidth: '40px'
            }}
            // onMouseDown={(e) => handleMouseDown(e, item.id, 'move')}
            // onDoubleClick={() => handleDoubleClick(item.id)}
            // title={`${item.name} (${item.startTime.toFixed(1)}s - ${(item.startTime + item.duration).toFixed(1)}s)`}
          >
            {/* 左侧调整手柄 */}
            {/* <div
              className="absolute left-0 top-0 w-2 h-full bg-purple-500/20 cursor-ew-resize opacity-0 hover:opacity-100 transition-opacity"
              onMouseDown={(e) => {
                e.stopPropagation();
                handleMouseDown(e, item.id, 'resize-left');
              }}
              title="调整开始时间"
            >
              <div className="absolute left-1 top-1/2 transform -translate-y-1/2 w-0.5 h-8 bg-purple-400 rounded-full opacity-80" />
              <div className="absolute left-2 top-1/2 transform -translate-y-1/2 w-0.5 h-6 bg-purple-300 rounded-full opacity-60" />
            </div> */}

            {/* 项目内容 */}
            <div className="flex-1 flex items-center justify-between min-w-0">
              <span className="text-white text-sm font-medium truncate">{item.name}</span>
              <span className="text-white/70 text-xs ml-2 shrink-0">
                {item.duration.toFixed(1)}s
              </span>
            </div>

            {/* 右侧调整手柄 */}
            {/* <div
              className="absolute right-0 top-0 w-2 h-full bg-purple-500/20 cursor-ew-resize opacity-0 hover:opacity-100 transition-opacity"
              onMouseDown={(e) => {
                e.stopPropagation();
                handleMouseDown(e, item.id, 'resize-right');
              }}
              title="调整持续时间"
            >
              <div className="absolute right-1 top-1/2 transform -translate-y-1/2 w-0.5 h-8 bg-purple-400 rounded-full opacity-80" />
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 w-0.5 h-6 bg-purple-300 rounded-full opacity-60" />
            </div> */}
          </div>
        );
      })}

      {/* 空轨道提示 */}
      {items.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm pointer-events-none">
          {`轨道内容`}
        </div>
      )}
    </>
  );

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
  )
}