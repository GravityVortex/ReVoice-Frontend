"use client";
import React, { useMemo } from "react";
import { Play, Edit, Clock, Calendar, Video } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn, getPreviewCoverUrl } from "@/shared/lib/utils";
import { Card, CardContent } from "@/shared/components/ui/card";
import { useRouter } from "next/navigation";

// pending/processing/completed/failed/cancelled'
export type VideoConversionStatus = "pending" | "completed" | "processing" | "failed" | "cancelled";

export interface VideoListItem {
  id: string;
  fileName: string; // 视频名称
  cover: string; // 封面图 URL
  videoUrl: string; // R2 视频地址
  status: VideoConversionStatus; // 转换状态
  duration?: string; // 视频时长，例如："5:23"
  convertedAt?: string; // 转换时间，例如："2024-01-15 14:30"
  createdAt?: string; // 创建时间
  videoSize: number; // 视频大小，单位B
  tasks: Record<string, string>[] | null;
}

export interface VideoListProps {
  items: VideoListItem[];
  className?: string;
  cols?: 1 | 2 | 3 | 4 | 5 | 6; // 每行列数，默认 3
  onVideoPlay?: (item: VideoListItem, index: number) => void;
  onEditClick?: (item: VideoListItem, index: number) => void;
  onItemClick?: (item: VideoListItem, index: number) => void;
  onStatusClick?: (item: VideoListItem, index: number) => void;
  locale?: string; // 用于路由国际化
}

// 状态颜色映射 (Modern Badge Styles)
const statusStyles: Record<VideoConversionStatus, string> = {
  pending: "bg-blue-600/90 text-white",
  processing: "bg-orange-500/90 text-white animate-pulse",
  completed: "bg-green-600/90 text-white",
  failed: "bg-red-600/90 text-white",
  cancelled: "bg-gray-600/90 text-white",
};

export function VideoList({
  items,
  className,
  cols = 3,
  onVideoPlay,
  onEditClick,
  onItemClick,
  onStatusClick,
  locale = "zh",
}: VideoListProps) {
  const router = useRouter();
  const t = useTranslations('video_convert.myVideoList');

  const colsClass = useMemo(() => {
    switch (cols) {
      case 1: return "grid-cols-1";
      case 2: return "grid-cols-2";
      case 3: return "grid-cols-3";
      case 4: return "grid-cols-4";
      case 5: return "grid-cols-5";
      case 6: return "grid-cols-6";
      default: return "grid-cols-3";
    }
  }, [cols]);

  const handleEdit = (item: VideoListItem, index: number) => {
    onEditClick?.(item, index);
  };
  const handlePlayVideo = (item: VideoListItem, index: number) => {
    onVideoPlay?.(item, index);
  };
  const handleItemClick = (item: VideoListItem, index: number) => {
    onItemClick?.(item, index);
  };
  const handleStatusClick = (item: VideoListItem, index: number) => {
    onStatusClick?.(item, index);
  };

  return (
    <div className={cn("grid gap-6", colsClass, className)}>
      {items.map((it, index) => (
        <VideoCard
          key={it.id}
          item={it}
          t={t}
          onEdit={() => handleEdit(it, index)}
          onPlay={() => handlePlayVideo(it, index)}
          onCardContentClick={() => handleItemClick(it, index)}
          onStatusClick={() => handleStatusClick(it, index)}
        />
      ))}
    </div>
  );
}

interface VideoCardProps {
  item: VideoListItem;
  t: (key: string) => string;
  onEdit: () => void;
  onPlay: () => void;
  onCardContentClick: () => void;
  onStatusClick: () => void;
}

// 卡片组件 - Premium Card Style
function VideoCard({
  item,
  t,
  onEdit,
  onPlay,
  onCardContentClick,
  onStatusClick,
}: VideoCardProps) {
  const { fileName, cover, status, duration, convertedAt, videoSize } = item;
  const [imgSrc, setImgSrc] = React.useState('/imgs/cover_video_def.jpg');

  React.useEffect(() => {
    if (cover) {
      const img = new Image();
      img.src = cover;
      img.onload = () => setImgSrc(cover);
      img.onerror = () => setImgSrc('/imgs/cover_video_def.jpg');
    }
  }, [cover]);

  // Modern refined status badges
  const statusConfig: Record<VideoConversionStatus, { color: string, icon: React.ReactNode }> = {
    pending: { color: "bg-blue-500/10 text-blue-600 border-blue-200", icon: <Clock className="w-3 h-3" /> },
    processing: { color: "bg-orange-500/10 text-orange-600 border-orange-200", icon: <Clock className="w-3 h-3 animate-spin" /> },
    completed: { color: "bg-green-500/10 text-green-600 border-green-200", icon: <CheckCircle2 className="w-3 h-3" /> },
    failed: { color: "bg-red-500/10 text-red-600 border-red-200", icon: <AlertCircle className="w-3 h-3" /> },
    cancelled: { color: "bg-gray-500/10 text-gray-600 border-gray-200", icon: <XCircle className="w-3 h-3" /> },
  };

  const config = statusConfig[status] || statusConfig.pending;

  return (
    <div className="group relative flex flex-col gap-3 rounded-2xl bg-card p-3 border border-border/50 shadow-sm transition-all duration-300 hover:shadow-lg hover:-translate-y-1 hover:border-primary/20">

      {/* Thumbnail Section */}
      <div
        className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted cursor-pointer"
        onClick={status === "completed" ? onPlay : onCardContentClick}
      >
        <img
          src={imgSrc}
          alt={fileName}
          onError={(e) => { e.currentTarget.src = '/imgs/cover_video_def.jpg' }}
          className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          loading="lazy"
        />

        {/* Overlay Gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Status Badge (Top Right) */}
        <div className="absolute top-2 right-2 flex gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); onStatusClick(); }}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border backdrop-blur-md shadow-sm transition-transform hover:scale-105",
              status === 'completed' ? "bg-white/90 text-green-700 border-white/20 dark:bg-black/60 dark:text-green-400" : "bg-white/90 text-foreground border-white/20 dark:bg-black/60"
            )}
          >
            <div className={cn("w-1.5 h-1.5 rounded-full",
              status === 'processing' ? 'bg-orange-500 animate-pulse' :
                status === 'completed' ? 'bg-green-500' :
                  status === 'failed' ? 'bg-red-500' : 'bg-blue-500'
            )} />
            {t(`statusShort.${status}`)}
          </button>
        </div>

        {/* Play Button Overlay */}
        {status === "completed" && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30 text-white shadow-xl hover:scale-110 transition-transform">
              <Play className="w-5 h-5 ml-0.5 fill-white" />
            </div>
          </div>
        )}

        {/* Duration Badge */}
        {duration && (
          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/60 text-white text-[10px] font-medium backdrop-blur-sm">
            {duration}
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="flex flex-col gap-1 px-1">
        <div className="flex items-start justify-between gap-2">
          <h3
            className="line-clamp-1 font-semibold text-base text-card-foreground group-hover:text-primary transition-colors cursor-pointer"
            onClick={onCardContentClick}
            title={fileName}
          >
            {fileName}
          </h3>

          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
              className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Edit"
            >
              <Edit className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
          <div className="flex items-center gap-1.5" title="Start Time">
            <Calendar className="w-3.5 h-3.5" />
            <span>{convertedAt?.split(' ')[0] || '-'}</span>
          </div>
          {videoSize > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="w-0.5 h-0.5 rounded-full bg-muted-foreground/50" />
              <span>{(videoSize / 1024 / 1024).toFixed(1)} MB</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { CheckCircle2, AlertCircle, XCircle } from "lucide-react";

export default VideoList;
