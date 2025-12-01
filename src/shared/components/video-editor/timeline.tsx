"use client";

import React, { useRef, useCallback } from 'react';
import { cn } from '@/shared/lib/utils';

interface TimelineProps {
  currentTime: number;
  totalDuration: number;
  zoom: number;
  onTimeChange: (newTime: number) => void;
  className?: string;
  hideLeftLabel?: boolean;
}

export function Timeline({ 
  currentTime, 
  totalDuration, 
  zoom, 
  onTimeChange, 
  className,
  hideLeftLabel = false
}: TimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);
  const [dragStartX, setDragStartX] = React.useState(0);
  const [dragStartTime, setDragStartTime] = React.useState(0);

  // 格式化时间显示 - 时间轴专用
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    
    if (mins > 0) {
      return `${mins}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${secs}s`;
    }
  };

  // 格式化当前时间显示 - 播放头专用
  const formatCurrentTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // 处理时间轴点击
  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (!timelineRef.current || isDragging) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const timelineWidth = rect.width;
    const newTime = (clickX / timelineWidth) * totalDuration;
    
    onTimeChange(Math.max(0, Math.min(newTime, totalDuration)));
  }, [totalDuration, onTimeChange, isDragging]);

  // 处理播放头拖动开始
  const handlePlayheadMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsDragging(true);
    setDragStartX(e.clientX);
    setDragStartTime(currentTime);
    
    document.body.style.cursor = 'ew-resize';
  }, [currentTime]);

  // 处理拖动过程
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging || !timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const deltaX = e.clientX - dragStartX;
    const timelineWidth = rect.width;
    const deltaTime = (deltaX / timelineWidth) * totalDuration;
    const newTime = dragStartTime + deltaTime;
    
    onTimeChange(Math.max(0, Math.min(newTime, totalDuration)));
  }, [isDragging, dragStartX, dragStartTime, totalDuration, onTimeChange]);

  // 处理拖动结束
  const handleMouseUp = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      document.body.style.cursor = '';
    }
  }, [isDragging]);

  // 添加全局事件监听器
  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      // 防止拖动时选中文本
      document.body.style.userSelect = 'none';
      document.body.style.webkitUserSelect = 'none';
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.userSelect = '';
        document.body.style.webkitUserSelect = '';
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  // 防止拖动时的默认行为
  React.useEffect(() => {
    const preventDragStart = (e: DragEvent) => {
      if (isDragging) {
        e.preventDefault();
      }
    };
    
    document.addEventListener('dragstart', preventDragStart);
    return () => document.removeEventListener('dragstart', preventDragStart);
  }, [isDragging]);

  // 生成时间刻度
  const generateTimeMarkers = () => {
    const markers = [];
    
    // 根据缩放级别和总时长智能调整刻度密度，最小显示刻度1秒
    let step: number;
    let mainStep: number;
    let showAllSecondLabels = false; // 是否显示所有秒数标签
    
    if (zoom >= 4) {
      step = 1;    // 1秒间隔（最小刻度）
      mainStep = 1;  // 每1秒显示时间标签
      showAllSecondLabels = true; // 高缩放时显示所有秒数
    } else if (zoom >= 3) {
      step = 1;    // 1秒间隔（最小刻度）
      mainStep = 2;  // 每2秒显示时间标签
    } else if (zoom >= 2) {
      step = 1;    // 1秒间隔（最小刻度）
      mainStep = 5;  // 每5秒显示时间标签
    } else if (zoom >= 1) {
      step = 2;    // 2秒间隔
      mainStep = 10; // 每10秒显示时间标签
    } else {
      step = 5;    // 5秒间隔
      mainStep = 15; // 每15秒显示时间标签
    }
    
    for (let i = 0; i <= totalDuration; i += step) {
      const leftPercent = (i / totalDuration) * 100;
      const isMainMarker = i % mainStep === 0;
      const isSecondaryMarker = i % (step * 2) === 0 && !isMainMarker;
      const showLabel = showAllSecondLabels ? (step === 1) : isMainMarker;
      
      markers.push(
        <div
          key={i}
          className={cn(
            "absolute top-0 border-l",
            isMainMarker 
              ? "border-gray-300 h-full" 
              : isSecondaryMarker 
                ? "border-gray-500 h-3" 
                : "border-gray-600 h-2"
          )}
          style={{ left: `${leftPercent}%` }}
        >
          {showLabel && (
            <span className={cn(
              "absolute top-1 left-1 text-xs whitespace-nowrap font-medium",
              showAllSecondLabels && step === 1 
                ? "text-gray-100" // 高缩放时的秒数标签更亮
                : "text-gray-200"
            )}>
              {showAllSecondLabels && step === 1 
                ? `${i}s` // 显示秒数格式如 "1s", "2s"
                : formatTime(i) // 显示时间格式如 "00:01"
              }
            </span>
          )}
        </div>
      );
    }
    
    return markers;
  };

  if (hideLeftLabel) {
    // 只显示时间轴内容，不显示左侧标签
    return (
      <div className={cn("h-full bg-gray-850 relative", className)} style={{ zIndex: 40 }}>
        <div
          ref={timelineRef}
          className="h-full cursor-pointer relative select-none"
          onClick={handleTimelineClick}
          style={{ 
            width: `${100 * zoom}%`,
            minWidth: '100%'
          }}
        >
          {/* 时间刻度 - 默认显示 */}
          {generateTimeMarkers()}
          
          {/* 播放头 - 横跨四轨道，可拖动 */}
          <div
            className={cn(
              "absolute top-0 w-0.5 bg-red-500 cursor-ew-resize group shadow-lg",
              isDragging ? "transition-none bg-red-600 shadow-xl" : "transition-all duration-100 ease-out"
            )}
            style={{ 
              left: `${(currentTime / totalDuration) * 100}%`,
              height: '320px', // 四轨道高度(320px)
              zIndex: 9999,
              boxShadow: isDragging ? '0 0 10px rgba(239, 68, 68, 0.5)' : '0 0 5px rgba(239, 68, 68, 0.3)',
              position: 'absolute',
              top: '0',
              pointerEvents: 'auto'
            }}
            onMouseDown={handlePlayheadMouseDown}
          >
            {/* 播放头顶部三角形 - 可拖动区域 */}
            <div 
              className={cn(
                "absolute -top-1 -left-2 w-4 h-4 flex items-center justify-center cursor-ew-resize",
                "hover:scale-110 transition-transform duration-150",
                isDragging && "scale-110"
              )}
              onMouseDown={handlePlayheadMouseDown}
            >
              <div className="w-0 h-0 border-l-2 border-r-2 border-b-4 border-l-transparent border-r-transparent border-b-red-500" />
            </div>

            {/* 播放头线条 - 增强拖动区域 */}
            <div 
              className="absolute -left-1 top-0 w-2 h-full cursor-ew-resize hover:bg-red-400/20 transition-colors duration-150"
              onMouseDown={handlePlayheadMouseDown}
            />

            {/* 播放头底部指示器 */}
            <div className={cn(
              "absolute -bottom-1 -left-1.5 w-0 h-0 border-l-[6px] border-r-[6px] border-t-8 border-l-transparent border-r-transparent border-t-red-500",
              "transition-all duration-150",
              isDragging && "scale-110"
            )} />

            {/* 拖动时的阴影效果 */}
            {isDragging && (
              <div className="absolute -left-1 top-0 w-2 h-full bg-red-500/30 animate-pulse" />
            )}
          </div>

          {/* 当前时间显示 */}
          <div
            className={cn(
              "absolute -top-8 bg-red-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none shadow-lg",
              isDragging ? "scale-110 bg-red-600 shadow-xl transition-none" : "transition-all duration-100 ease-out"
            )}
            style={{ 
              left: `${(currentTime / totalDuration) * 100}%`,
              transform: 'translateX(-50%)',
              zIndex: 60
            }}
          >
            {formatCurrentTime(currentTime)}
            
            {/* 拖动时的指示箭头 */}
            {isDragging && (
              <div className="absolute -bottom-1 top-13 left-1/3 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-l-transparent border-r-transparent border-t-red-600" >
                12:20
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("h-12 bg-gray-800 border-b border-gray-700 flex relative", className)} style={{ zIndex: 40 }}>
      {/* 左侧占位区域，与轨道标签对齐 */}
      <div className="w-32 bg-gray-750 border-r border-gray-700 flex items-center justify-center">
        <span className="text-xs text-gray-400 font-medium">时间轴</span>
      </div>
      
      {/* 时间轴内容区域 */}
      <div className="flex-1 relative bg-gray-850">
        <div
          ref={timelineRef}
          className="h-full cursor-pointer relative select-none"
          onClick={handleTimelineClick}
          style={{ 
            width: `${100 * zoom}%`,
            minWidth: '100%' // 确保至少占满容器宽度
          }}
        >
          {/* 背景网格 */}
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            {Array.from({ length: Math.ceil(totalDuration / 5) + 1 }, (_, i) => (
              <div
                key={i}
                className="absolute top-0 h-full border-l border-gray-700"
                style={{ left: `${(i * 5 / totalDuration) * 100}%` }}
              />
            ))}
          </div>
          {/* 时间刻度 - 默认显示 */}
          {generateTimeMarkers()}
          
          {/* 播放头 - 横跨四轨道，可拖动 */}
          <div
            className={cn(
              "absolute top-0 w-0.5 bg-red-500 cursor-ew-resize group shadow-lg",
              isDragging ? "transition-none bg-red-600 shadow-xl" : "transition-all duration-100 ease-out"
            )}
            style={{ 
              left: `${(currentTime / totalDuration) * 100}%`,
              height: '368px', // 时间轴高度(48px) + 四轨道高度(320px) = 368px
              zIndex: 9999, // 确保在最顶层
              boxShadow: isDragging ? '0 0 10px rgba(239, 68, 68, 0.5)' : '0 0 5px rgba(239, 68, 68, 0.3)',
              position: 'absolute',
              top: '0',
              pointerEvents: isDragging ? 'auto' : 'auto' // 确保可以交互
            }}
            onMouseDown={handlePlayheadMouseDown}
          >
            {/* 播放头顶部三角形 - 可拖动区域 */}
            <div 
              className={cn(
                "absolute -top-1 -left-2 w-4 h-4 flex items-center justify-center cursor-ew-resize",
                "hover:scale-110 transition-transform duration-150",
                isDragging && "scale-110"
              )}
              onMouseDown={handlePlayheadMouseDown}
            >
              <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-b-8 border-l-transparent border-r-transparent border-t-transparent border-b-red-500" />
            </div>
            
            {/* 播放头线条 - 增强拖动区域 */}
            <div 
              className="absolute -left-1 top-0 w-2 h-full cursor-ew-resize hover:bg-red-400/20 transition-colors duration-150"
              onMouseDown={handlePlayheadMouseDown}
            />
            
            {/* 播放头底部指示器 */}
            <div className={cn(
              "absolute -bottom-1 -left-1.5 w-0 h-0 border-l-[6px] border-r-[6px] border-t-8 border-l-transparent border-r-transparent border-t-red-500",
              "transition-all duration-150",
              isDragging && "scale-110"
            )} />
            
            {/* 拖动时的阴影效果 */}
            {isDragging && (
              <div className="absolute -left-1 top-0 w-2 h-full bg-red-500/30 animate-pulse" />
            )}
          </div>
          
          {/* 当前时间显示 */}
          <div
            className={cn(
              "absolute -top-8 bg-red-500 text-white text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none shadow-lg",
              isDragging ? "scale-110 bg-red-600 shadow-xl transition-none" : "transition-all duration-100 ease-out"
            )}
            style={{ 
              left: `${(currentTime / totalDuration) * 100}%`,
              transform: 'translateX(-50%)',
              zIndex: 60
            }}
          >
            {formatCurrentTime(currentTime)}
            
            {/* 拖动时的指示箭头 */}
            {isDragging && (
              <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-2 border-r-2 border-t-2 border-l-transparent border-r-transparent border-t-red-600" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
