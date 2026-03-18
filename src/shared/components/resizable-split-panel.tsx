"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/shared/lib/utils';

interface ResizableSplitPanelProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  minLeftWidthPercent?: number;
  minRightWidthPercent?: number;
  minRightWidthPx?: number;
  defaultLeftWidthPercent?: number;
  className?: string;
}

export function ResizableSplitPanel({
  leftPanel,
  rightPanel,
  minLeftWidthPercent = 33.33,
  minRightWidthPercent = 20,
  minRightWidthPx = 600,
  defaultLeftWidthPercent = 50,
  className,
}: ResizableSplitPanelProps) {
  const [leftWidthPercent, setLeftWidthPercent] = useState(defaultLeftWidthPercent);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const newLeftWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;

      // 计算右侧面板的像素最小宽度对应的百分比
      const minRightWidthPercentFromPx = (minRightWidthPx / containerRect.width) * 100;
      const effectiveMinRightPercent = Math.max(minRightWidthPercent, minRightWidthPercentFromPx);

      // 限制最小和最大宽度
      const clampedWidth = Math.max(
        minLeftWidthPercent,
        Math.min(100 - effectiveMinRightPercent, newLeftWidth)
      );

      setLeftWidthPercent(clampedWidth);
    },
    [isDragging, minLeftWidthPercent, minRightWidthPercent, minRightWidthPx]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div ref={containerRef} className={cn("flex h-full w-full", className)}>
      {/* 左侧面板 */}
      <div
        style={{ width: `${leftWidthPercent}%` }}
        className="h-full overflow-hidden"
      >
        {leftPanel}
      </div>

      {/* 分割线 */}
      <div
        onMouseDown={handleMouseDown}
        className={cn(
          "group relative w-3 cursor-col-resize transition-colors flex-shrink-0",
          "bg-transparent hover:bg-white/5",
          isDragging && "bg-white/[0.06]"
        )}
      >
        <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/10 group-hover:bg-white/15 transition-colors" />
        <div className="w-full h-full flex items-center justify-center">
          <div
            aria-hidden
            className={cn(
              "h-12 w-1.5 rounded-full transition-all duration-200",
              "bg-white/10 ring-1 ring-white/15",
              "group-hover:bg-primary/25 group-hover:ring-primary/30 group-hover:h-16",
              isDragging && "bg-primary/30 ring-primary/40 h-16"
            )}
          />
        </div>
      </div>

      {/* 右侧面板 */}
      <div
        style={{ width: `${100 - leftWidthPercent}%` }}
        className="h-full overflow-hidden"
      >
        {rightPanel}
      </div>
    </div>
  );
}
