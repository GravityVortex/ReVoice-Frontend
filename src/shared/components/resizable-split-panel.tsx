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
          "w-1 bg-border hover:bg-primary/50 cursor-col-resize transition-colors flex-shrink-0",
          isDragging && "bg-primary"
        )}
      >
        <div className="w-full h-full flex items-center justify-center">
          <div className="w-0.5 h-8 bg-muted-foreground/20 rounded-full" />
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
