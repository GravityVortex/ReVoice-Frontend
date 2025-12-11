"use client";

import { cn, formatDate, getLanguageConvertStr, miao2Hms } from "@/shared/lib/utils";
import { Card, CardContent } from "@/shared/components/ui/card";
import { motion } from "motion/react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import { Button } from "@/shared/components/ui/button";
import {
  ChevronDown,
  Video,
  CircleEllipsis,
  Play,
  Download,
  Edit2,
  Loader2,
  BookmarkX,
  ListOrdered,
  Share2,
  Edit,
} from "lucide-react";

interface RightContentPanelProps {
  taskMainList: any[];
  videoDetail: any;
  preUrl: string;
  expandedMap: Record<string, boolean>;
  onExpandChange: (index: number) => void;
  onPlayVideo: (url: string, title: string) => void;
  onDownLoadClick: (e: any) => void;
  onSonItemEditClick: (taskMainId: string) => void;
  onProgressClick: (taskMainId: string, tabIdx: string) => void;
  onDevelopClick: () => void;
  onDownloadSrtClick: (e: any, stepName: string) => void;
  onCompareClick: () => void;
}

const statusMap: any = {
  "pending": { label: "排队中", color: "text-cyan-600" },
  "processing": { label: "转换中", color: "text-orange-500" },
  "completed": { label: "转换成功", color: "text-green-600" },
  "failed": { label: "转换失败", color: "text-red-500" },
  "cancelled": { label: "已取消", color: "text-gray-500" },
};

const image: React.CSSProperties = {
  width: "100%",
  height: "100%",
}

const shape: React.CSSProperties = {
  strokeWidth: 6,
  strokeLinecap: "round",
  fill: "transparent",
}

const getPreviewVideoUrl = (taskMain: any, type: string) => {
  return taskMain?.finalFileList?.find((finalFile: any) => finalFile.fileType === type)?.r2Key;
}

export function RightContentPanel({
  taskMainList,
  videoDetail,
  preUrl,
  expandedMap,
  onExpandChange,
  onPlayVideo,
  onDownLoadClick,
  onSonItemEditClick,
  onProgressClick,
  onDevelopClick,
  onDownloadSrtClick,
  onCompareClick,
}: RightContentPanelProps) {
  return (
    <main className="flex-1 overflow-auto p-6">
      {/* 转换视频列表页面 */}
      {taskMainList.map((taskMain: any, index: number) => (
        <div key={index}>
          {/* 可折叠卡片 isExpanded*/}
          <Collapsible
            id={`row_id_${index}`}
            open={expandedMap[`id_row_${index}`]}
            onOpenChange={() => onExpandChange(index)}
            className="mb-5 transition-all duration-500 ease-in-out">
            <Card className="w-full pt-2 pb-0 gap-0">
              <CardContent className="space-y-4 pb-2">
                {/* 折叠时显示的内容 - 上方左侧视频播放器 + 右侧基本信息 */}
                <CollapsibleTrigger asChild>
                  <div className="flex gap-6 py-2 my-0">
                    {/* 列表中：头部视频封面 */}
                    <div className="grow-0 h-30 relative aspect-video overflow-hidden rounded-lg bg-black">
                      {getPreviewVideoUrl(taskMain, 'preview') ? (
                        <>
                          {videoDetail?.coverR2Key && (
                            <img
                              src={preUrl + '/' + videoDetail.coverR2Key}
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                              }}
                              className={cn(
                                "h-30 object-cover aspect-video",
                                taskMain?.status === "pending" && "animate-pulse"
                              )}
                            />
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onPlayVideo(getPreviewVideoUrl(taskMain, 'preview'), videoDetail?.fileName || '')
                            }}
                            className="absolute inset-0 flex items-center justify-center bg-black/30 transition-all hover:bg-black/40"
                          >
                            <div className="flex size-14 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform hover:scale-110">
                              <Play className="ml-1 size-7 text-black" fill="currentColor" />
                            </div>
                          </button>
                        </>
                      ) : (
                        <div className="relative flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                          <Video className={cn("size-10 text-muted-foreground", taskMain?.status === "processing" && "animate-pulse")} />
                          {/* 描边动画 - 仅在处理中时显示 */}
                          {(taskMain?.status === "processing" || taskMain?.status === "pending") && (
                            <motion.svg
                              className="absolute inset-0"
                              width="100%"
                              height="100%"
                              style={image}
                            >
                              <defs>
                                <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                  <stop offset="0%" stopColor="#818cf888" />
                                  <stop offset="100%" stopColor="#6a73cc88" />
                                </linearGradient>
                              </defs>
                              <motion.rect
                                width="100%"
                                height="100%"
                                x="0"
                                y="0"
                                rx="8"
                                stroke="url(#gradient)"
                                strokeDasharray="0.8 0.2"
                                pathLength="1"
                                animate={{ strokeDashoffset: [0, -1] }}
                                transition={{ duration: 4, repeat: Infinity, ease: "easeIn" }}
                                style={shape}
                              />
                            </motion.svg>
                          )}
                        </div>
                      )}
                    </div>
                    {/* 列表中：头部基本信息 */}
                    <div className="grow space-y-3 mt-2">
                      <div className="flex justify-between space-y-1">
                        <p className="font-medium text-primary hover:text-primary/80">
                          {videoDetail?.fileName || "-"}
                          <span className={cn("ml-5 text-sm font-medium",
                            `${statusMap[taskMain?.status || ""]?.color}`
                          )}>
                            {`【${statusMap[taskMain?.status || ""]?.label}】`}
                          </span>
                          <span className={`ml-5 text-sm text-green-600`}>
                            【{getLanguageConvertStr(taskMain)}】
                          </span>
                        </p>
                        <ChevronDown
                          className={cn(
                            "size-5 text-muted-foreground transition-all duration-500 ease-in-out",
                            expandedMap[`id_row_${index}`] && "rotate-180"
                          )}
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="ml-0 font-medium">{taskMain?.processDurationSeconds ? `目标视频时长：${miao2Hms(taskMain?.processDurationSeconds)} ` : "-"}</span>
                      </div>

                      <div className="flex justify-between items-end">
                        <span className="inline-block font-medium">{`开始转换时间：${formatDate(taskMain?.startedAt || "")}`}</span>
                        {/* 操作按钮 - 右下角 */}
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm"
                            disabled={taskMain?.status !== "completed"}
                            onClick={onDownLoadClick}>
                            <Download className="size-4" />
                            下载
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={taskMain?.status !== "completed"}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSonItemEditClick("convert_" + index);
                            }}>
                            <Edit2 className="size-4" />
                            编辑
                          </Button>
                          <Button variant="outline" size="sm" onClick={(e) => {
                            e.stopPropagation();
                            onProgressClick(taskMain?.id, "1");
                          }}>
                            <ListOrdered className="size-4" />
                            进度
                          </Button>
                          <Button variant="destructive" size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDevelopClick();
                            }}>
                            <BookmarkX className="size-4" />
                            取消
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CollapsibleTrigger>

                {/* 展开时显示的详细信息 */}
                <CollapsibleContent className="overflow-hidden transition-all data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                  {/* 分隔虚线 */}
                  <div aria-hidden
                    className="mt-3 mb-5 h-px min-w-0 [background-image:linear-gradient(90deg,var(--color-foreground)_1px,transparent_1px)] bg-[length:6px_1px] bg-repeat-x opacity-25" />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div
                        className="flex items-center gap-1 px-0 mx-0 text-lg text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          onProgressClick(taskMain?.id, "1");
                        }}>
                        转换进度 <CircleEllipsis className="size-4" />
                      </div>
                      <span className="text-2xl font-bold text-primary">
                        {taskMain?.progress}%
                      </span>
                    </div>
                    <div className="relative h-2 w-full rounded-full bg-gray-600">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${taskMain?.progress}%`, opacity: taskMain?.progress >= 100 ? 1 : 0.5 }} />

                      {taskMain?.progress < 100 && (
                        <motion.div
                          className="absolute top-0 h-full rounded-full bg-primary"
                          initial={{ width: 0 }}
                          animate={{ width: `${taskMain?.progress === 0 ? 100 : taskMain?.progress}%` }}
                          transition={{ duration: 1.5, ease: "easeOut", repeat: Infinity, repeatDelay: 3 }}
                        />
                      )}
                    </div>

                    {/* 步骤展示 */}
                    <div className="pt-1 flex flex-row justify-between gap-2">
                      {[
                        { name: '音视频分离', range: [0, 11] },
                        { name: '人声背景分离', range: [12, 22] },
                        { name: '生成原始字幕', range: [23, 33] },
                        { name: '翻译字幕', range: [34, 44] },
                        { name: '音频切片', range: [45, 55] },
                        { name: '语音合成', range: [56, 66] },
                        { name: '音频时间对齐', range: [67, 77] },
                        { name: '合并音频', range: [78, 88] },
                        { name: '合并音视频', range: [89, 100] },
                      ].map((step, index) => {
                        const progress = taskMain?.progress || 0;
                        const isActive = progress >= step.range[0] && progress < step.range[1];
                        const isCompleted = progress >= step.range[1];

                        return (
                          <div key={index} className="text-center">
                            <p className={cn(
                              "flex flex-row items-center gap-1 text-xs font-medium transition-colors",
                              isActive && "text-cyan-600 font-semibold",
                              isCompleted && "text-green-600",
                              !isActive && !isCompleted && "text-gray-400"
                            )}>
                              {step.name}
                              {isActive && (<Loader2 className="size-4 animate-spin text-cyan-600" />)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-0 mt-4 space-y-4">
                    <div
                      className="flex items-center gap-1 px-0 mx-0 text-lg text-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        onProgressClick(taskMain?.id, "0");
                      }}>
                      基本信息 <CircleEllipsis className="size-4" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">目标视频语言</p>
                        <p className="font-medium">英语</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">目标视频时长</p>
                        <p className="font-medium">{miao2Hms(taskMain?.processDurationSeconds)} </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">开始转换时间</p>
                        <p className="font-medium">{formatDate(taskMain?.startedAt || "")}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">转换结束时间</p>
                        <p className="font-medium">{formatDate(taskMain?.completedAt || "")}</p>
                      </div>
                    </div>

                    {/* 分隔虚线 */}
                    <div aria-hidden
                      className="mt-8 mb-0 h-px min-w-0 [background-image:linear-gradient(90deg,var(--color-foreground)_1px,transparent_1px)] bg-[length:6px_1px] bg-repeat-x opacity-25" />

                    {/* 底部 */}
                    <div className="flex space-y-0 gap-6">
                      <div className="flex-1 gap-6 mt-5 mb-5">
                        <p className="text-primary text-lg text-muted-foreground text-center">音频</p>
                        <p className="text-sm text-muted-foreground my-5 text-center">视频转换成功后，音频也可以单独下载，在下载前，建议您先试听一下。</p>
                        <div className="flex justify-around mt-2 gap-2">
                          <Button variant="outline" size="sm"
                            disabled={taskMain?.status !== "completed"}
                            onClick={onDevelopClick}>
                            <Share2 className="size-4" />
                            试听
                          </Button>
                          <Button variant="outline" size="sm"
                            disabled={taskMain?.status !== "completed"}
                            onClick={onDevelopClick}>
                            <Download className="size-4" />
                            下载
                          </Button>
                        </div>
                      </div>

                      {/* 分隔虚线 */}
                      <div aria-hidden
                        className="my-0 min-h-full min-w-1 [background-image:linear-gradient(0deg,var(--color-foreground)_1px,transparent_1px)] bg-[length:1px_6px] bg-repeat-y opacity-25" />

                      <div className="flex-1 gap-6 mt-5 mb-5">
                        <p className="text-primary text-lg text-muted-foreground text-center">字幕</p>
                        <p className="text-sm text-muted-foreground my-5 text-center">视频转换成功后，字幕可以单独下载，翻译后的字幕可以和原视频字幕对比。</p>
                        <div className="flex justify-around mt-2 gap-2">
                          <Button variant="outline" size="sm"
                            disabled={taskMain?.status !== "completed"}
                            onClick={(e) => {
                              e.stopPropagation();
                              onCompareClick();
                            }}>
                            <Edit className="size-4" />
                            对比
                          </Button>
                          <Button variant="outline" size="sm"
                            disabled={taskMain?.status !== "completed"}
                            onClick={(e) => onDownloadSrtClick(e, 'translate_srt')}>
                            <Download className="size-4" />
                            下载
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </CardContent>
            </Card>
          </Collapsible>
        </div>
      ))}
    </main>
  );
}
