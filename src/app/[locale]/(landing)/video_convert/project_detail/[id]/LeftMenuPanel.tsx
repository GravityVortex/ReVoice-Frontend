"use client";

import { cn, formatDate, getVideoR2PathName, miao2Hms } from "@/shared/lib/utils";
import { Play, Video, Coins, Trash2 } from "lucide-react";

interface LeftMenuPanelProps {
  videoDetail: any;
  leftCoverSrc: string;
  menuItems: any[];
  activeMenu: string;
  handlMenuClick: (item: any) => void;
  handlePlayVideo: (url: string, title: string) => void;
  t: (key: string) => string;
}

export function LeftMenuPanel({
  videoDetail,
  leftCoverSrc,
  menuItems,
  activeMenu,
  handlMenuClick,
  handlePlayVideo,
  t,
}: LeftMenuPanelProps) {

  const getPreviewVideoUrl = (videoFile: any) => {
    // console.log('getPreviewVideoUrl---taskMain--->', videoFile)
    return getVideoR2PathName(videoFile.userId, videoFile.id, videoFile.r2Key)
    // return videoDetail.r2Key;
  }

  return (
    <aside className="flex flex-col border-r w-96 shrink-0 bg-card">
      {/* 超出隐藏*/}
      <div className="flex flex-col flex-1 pb-0 overflow-y-hidden">
        {/* 视频播放器 */}
        <div className="p-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
            {videoDetail?.r2Key ? (
              <>
                <img
                  src={leftCoverSrc}
                  alt={videoDetail.fileName || "视频封面"}
                  onError={(e) => {
                    e.currentTarget.src = '/imgs/cover_video_def.jpg';
                  }}
                  className="h-full w-full object-cover"
                />
                <button
                  onClick={() => handlePlayVideo(getPreviewVideoUrl(videoDetail), videoDetail.fileName)}
                  className="absolute inset-0 flex items-center justify-center bg-[rgba(0,0,0,0.3)] transition-all hover:bg-[rgba(0,0,0,0.4)]"
                >
                  <div className="flex size-16 items-center justify-center rounded-full bg-[rgba(255,255,255,0.9)] shadow-lg transition-transform hover:scale-110">
                    <Play className="ml-1 size-8 text-black" fill="currentColor" />
                  </div>
                </button>
              </>
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                <Video className="size-12 text-muted-foreground" />
              </div>
            )}
          </div>
        </div>

        {/* 基本信息，可滚动内容区域 */}
        <div className="px-6 pb-6 space-y-5">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{t('videoInfo.originalVideo')}</p>
            <p className="font-semibold text-base text-primary">{videoDetail?.fileName || "-"}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('videoInfo.size')}</p>
              <p className="font-semibold text-base">{((videoDetail?.fileSizeBytes || 0) / 1024 / 1024).toFixed(2)}MB</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">{t('videoInfo.duration')}</p>
              <p className="text-sm font-medium">{videoDetail?.videoDurationSeconds ? `${miao2Hms(videoDetail?.videoDurationSeconds)}` : "-"}</p>
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('videoInfo.uploadTime')}</p>
            <p className="text-sm font-medium">{formatDate(videoDetail?.createdAt || "")}</p>
          </div>
        </div>
      </div>

      {/* 底部固定按钮区域 */}
      <div className="shrink-0">
        {/* 分隔虚线 */}
        <div aria-hidden
          className="mt-0 h-px min-w-0 [background-image:linear-gradient(90deg,var(--color-foreground)_1px,transparent_1px)] bg-[length:6px_1px] bg-repeat-x opacity-25" />

        {/* 菜单列表 */}
        <nav className="px-2 mt-2 pb-2">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={handlMenuClick.bind(null, item)}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                activeMenu === item.id + 1
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <item.icon className="size-4" />
              {item.label}
            </button>
          ))}
        </nav>
        {/* 底部水平两个按钮 */}
        <div className="flex flex-row shrink-0 border-t bg-muted">
          <button
            onClick={handlMenuClick.bind(null, { id: "credits" })}
            className={cn(
              "flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-medium",
              "hover:bg-primary/90 transition-colors"
            )}>
            <Coins className="size-4" />
            {t('menu.credits')}
          </button>
          <button
            onClick={handlMenuClick.bind(null, { id: "delete" })}
            className={cn(
              "flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-medium",
              "border-l border-primary-foreground/20 hover:bg-primary/90 transition-colors"
            )}>
            <Trash2 className="size-4" />
            {t('menu.delete')}
          </button>
        </div>
      </div>
    </aside>
  );
}
