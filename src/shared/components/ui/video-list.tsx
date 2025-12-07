"use client";
import React, { useMemo } from "react";
import { Play, Edit, Clock, Calendar, Video } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { Card, CardContent } from "@/shared/components/ui/card";
import { useRouter } from "next/navigation";

// pending/processing/completed/failed/cancelled'
export type VideoConversionStatus = "pending" | "completed" | "processing" | "failed" | "cancelled";

export interface VideoListItem {
  id: string;
  title: string; // 视频名称
  cover: string; // 封面图 URL
  videoUrl: string; // R2 视频地址
  status: VideoConversionStatus; // 转换状态
  duration?: string; // 视频时长，例如："5:23"
  convertedAt?: string; // 转换时间，例如："2024-01-15 14:30"
  createdAt?: string; // 创建时间
  videoSize: number; // 视频大小，单位B
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

// 状态颜色映射
const statusColors: Record<VideoConversionStatus, { bg: string; text: string; border: string }> = {
  pending: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
  },
  completed: {
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-green-200",
  },
  processing: {
    bg: "bg-orange-50",
    text: "text-orange-700",
    border: "border-orange-200",
  },
  failed: {
    bg: "bg-gray-50",
    text: "text-gray-700",
    border: "border-gray-200",
  },
  cancelled: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
  },
};

// 状态文本映射
const statusText: Record<VideoConversionStatus, string> = {
  pending: "等待中",
  completed: "转换成功",
  processing: "转换中",
  failed: "转换失败",
  cancelled: "已取消",
};

// -------------------------------VideoList---start----分隔符---------------------------
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

  // 缓存数据
  const colsClass = useMemo(() => {
    switch (cols) {
      case 1:
        return "grid-cols-1";
      case 2:
        return "grid-cols-2";
      case 3:
        return "grid-cols-3";
      case 4:
        return "grid-cols-4";
      case 5:
        return "grid-cols-5";
      case 6:
        return "grid-cols-6";
      default:
        return "grid-cols-3";
    }
  }, [cols]);

  // 跳转编辑页面
  const handleEdit = (item: VideoListItem, index: number) => {
    // router.push(`/${locale}/video_convert/update?id=${item.id}`);
    onEditClick?.(item, index);
  };
  // 播放视频
  const handlePlayVideo = (item: VideoListItem, index: number) => {
    onVideoPlay?.(item, index);
  };

  // 点击标题跳转详情页
  const handleItemClick = (item: VideoListItem, index: number) => {
    console.log("[VideoList] 点击标题，跳转到项目详情页，ID:", item.id);
    onItemClick?.(item, index);
    // router.push(`/${locale}/video_convert/project_detail/${item.id}`);
  };
  // 状态点击
  const handleStatusClick = (item: VideoListItem, index: number) => {
    onStatusClick?.(item, index);
  };

  return (
    <div className={cn("grid gap-6", colsClass, className)}>
      {items.map((it, index) => (
        <VideoCard
          key={it.id}
          item={it}
          onEdit={() => handleEdit(it, index)}
          onPlay={() => handlePlayVideo(it, index)}
          onCardContentClick={() => handleItemClick(it, index)}
          onStatusClick={() => handleStatusClick(it, index)}
        />
      ))}
    </div>
  );
}
// -------------------------------VideoList---end----分隔符---------------------------

// -------------------------------VideoCard---start----分隔符---------------------------
// 卡片组件
function VideoCard({
  item,
  onEdit,
  onPlay,
  onCardContentClick,
  onStatusClick,
}: {
  item: VideoListItem;
  onEdit: () => void;
  onPlay: () => void;
  onCardContentClick: () => void;
  onStatusClick: () => void;
}) {
  const { title, cover, status, duration, convertedAt, videoSize } = item;
  const colors = statusColors[status];

  return (
    // rounded-bl-md rounded-br-md rounded-tl-[0] 
    <Card className="rounded-[2px] py-0 group overflow-hidden transition-transform duration-300 ease-out hover:-translate-y-1 hover:shadow-xl hover:ring-1 hover:ring-primary/20">
      {/* 封面区域 */}
      <div className="rounded-tl-[2px] rounded-tr-[2px] relative aspect-video w-full overflow-hidden bg-muted/40">
        {cover ? (
          <img
            src={cover}
            alt={title}
            className="rounded-tl-[2px] rounded-tr-[2px] h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03] "
            // className="rounded-tl-[2px] rounded-tr-[2px] h-full w-full object-cover transition-all duration-300 ease-out group-hover:scale-[1.03] opacity-99 blur-[0.9px] brightness-90 contrast-90"
            loading="lazy"
          />
        ) : (
          <div className="rounded-tl-[2px] rounded-tr-[2px] h-full w-full bg-gradient-to-br from-muted to-muted/50 opacity-70 blur-[0.5px]" />
        )}

        {/* 毛玻璃效果覆盖层 */}
        {status === "failed" && (
          <div className="pointer-events-none absolute inset-0 bg-black/80 backdrop-blur-[3px]" />
        )}


        {/* 悬浮遮罩 */}
        <div className="pointer-events-none absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/10" />

        {/* 中间播放按钮 */}
        {status === "completed" && (
          <button
            type="button"
            aria-label="play video"
            onClick={onPlay}
            className="absolute inset-0 m-auto flex size-16 items-center justify-center rounded-full bg-black/60 backdrop-blur-sm transition-all duration-300 hover:scale-110 hover:bg-black/80"
          >
            <Play className="size-8 fill-white text-white" />
          </button>
        )}

        {/* 右上角状态三角形 */}
        <div className="absolute right-0 top-0 overflow-hidden"
          onClick={onStatusClick}
        >
          {/* 直角三角形 - 两个直角边与封面上右边重叠 */}
          <div
            className={cn(
              "w-0 h-0 border-l-transparent border-b-transparent",
              status === "pending" && "border-t-blue-500 border-r-blue-500",
              status === "completed" && "border-t-green-700 border-r-green-700",
              status === "processing" && "border-t-orange-400 border-r-orange-400",
              status === "failed" && "border-t-gray-600 border-r-gray-600",
              status === "cancelled" && "border-t-red-600 border-r-red-600"
            )}
            style={{
              borderTopWidth: "28px",
              borderRightWidth: "28px",
              borderLeftWidth: "28px",
              borderBottomWidth: "28px",
              borderLeftColor: "transparent",
              borderBottomColor: "transparent"
            }}
          />
          {/* 状态文字 */}
          <div className="absolute top-1.5 right-1.5 w-6 h-6 flex items-center justify-center">
            <span className="text-white text-[10px] font-bold leading-none transform rotate-45 whitespace-nowrap">
              {status === "pending" && "等待"}
              {status === "completed" && "成功"}
              {status === "processing" && "转换中"}
              {status === "failed" && "失败"}
              {status === "cancelled" && "取消"}
            </span>
          </div>
        </div>

        {/* 右上角编辑按钮 */}
        <button
          type="button"
          aria-label="edit"
          onClick={onEdit}
          className="absolute right-[3px] bottom-[3px] inline-flex size-8 items-center justify-center border bg-background/80 text-foreground/70 backdrop-blur-sm transition-colors hover:bg-background hover:text-foreground"
        >
          <Edit className="size-4" />
        </button>
      </div>

      {/* 信息区域 */}
      <CardContent onClick={onCardContentClick} className="space-y-3 pt-4 pb-4 pl-3 pr-3 mt-[-20px]">
        {/* 视频名称 - 可点击 */}
        <div
          className="line-clamp-2 text-base font-semibold leading-snug cursor-pointer hover:text-primary transition-colors"
        // onClick={onCardContentClick}
        >
          {title}
        </div>

        {/* 视频元信息 */}
        <div className="relative flex flex-col gap-2 text-sm text-muted-foreground">
          {/* 时长 */}
          {duration && (
            <div className="flex flex-row justify-between items-center gap-1">
              <div className="flex items-center gap-1.5">
                <Clock className="size-4" />
                <span>视频时长: {duration}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Video className="size-4" />
                <span>视频大小: {(videoSize / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            </div>
          )}

          {/* 转换时间 */}
          {convertedAt && (
            <div className="flex items-center gap-1.5">
              <Calendar className="size-4" />
              <span>上传时间: {convertedAt}</span>
            </div>
          )}


        </div>


      </CardContent>
    </Card>
  );
}

export default VideoList;
