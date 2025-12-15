"use client";

import { cn, formatDate, getLanguageConvertStr, getLanguageMapStr, getPreviewCoverUrl, getVideoR2PathName, miao2Hms } from "@/shared/lib/utils";
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
  onDownLoadClick: (e: any, taskMain: any) => void;
  onSonItemEditClick: (taskMainId: string) => void;
  onProgressClick: (taskMainId: string, tabIdx: string) => void;
  onDevelopClick: () => void;
  onDownloadSrtClick: (e: any, stepName: string) => void;
  onAudioClick: (item: any, type: string) => void;
  onCompareClick: () => void;
  t: (key: string) => string;
  locale: string;
}


const image: React.CSSProperties = {
  width: "100%",
  height: "100%",
}

const shape: React.CSSProperties = {
  strokeWidth: 6,
  strokeLinecap: "round",
  fill: "transparent",
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
  onAudioClick,
  onDownloadSrtClick,
  onCompareClick,
  t,
  locale,
}: RightContentPanelProps) {
  const statusMap: any = {
    "pending": { label: t('status.pending'), color: "text-cyan-600" },
    "processing": { label: t('status.processing'), color: "text-orange-500" },
    "completed": { label: t('status.completed'), color: "text-green-600" },
    "failed": { label: t('status.failed'), color: "text-red-500" },
    "cancelled": { label: t('status.cancelled'), color: "text-gray-500" },
  };

  const steps = [
    { name: t('steps.audioVideoSeparation'), range: [0, 11] },
    { name: t('steps.vocalBackgroundSeparation'), range: [12, 22] },
    { name: t('steps.generateSubtitles'), range: [23, 33] },
    { name: t('steps.translateSubtitles'), range: [34, 44] },
    { name: t('steps.audioSlicing'), range: [45, 55] },
    { name: t('steps.voiceSynthesis'), range: [56, 66] },
    { name: t('steps.audioAlignment'), range: [67, 77] },
    { name: t('steps.mergeAudio'), range: [78, 88] },
    { name: t('steps.mergeVideo'), range: [89, 100] },
  ];

  const getPreviewVideoUrl = (taskMain: any, type: string) => {
  // console.log('getPreviewVideoUrl---taskMain--->', taskMain)
  const r2Key = taskMain?.finalFileList?.find((finalFile: any) => finalFile.fileType === type)?.r2Key;
  return getVideoR2PathName(videoDetail.userId, taskMain.id, r2Key)
}

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
                {/* 折叠时显示的内容 - 上方左侧视频播放器 + 右侧{t('conversion.basicInfo')} */}
                <CollapsibleTrigger asChild>
                  <div className="flex gap-6 py-2 my-0">
                    {/* 列表中：头部视频封面 */}
                    <div className="grow-0 h-30 relative aspect-video overflow-hidden rounded-lg bg-black">
                      {getPreviewVideoUrl(taskMain, 'preview') ? (
                        <>
                          {videoDetail?.coverR2Key && (
                            <img
                              // src={preUrl + '/' + videoDetail.coverR2Key}
                              src={getPreviewCoverUrl(videoDetail, preUrl)}
                              onError={(e) => {
                                console.log("[RightContentPanel] onError", e);
                                // e.currentTarget.style.display = 'none';
                                e.currentTarget.src = '/imgs/cover_video_def.jpg';
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
                    {/* 列表中：头部{t('conversion.basicInfo')} */}
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
                            【{getLanguageConvertStr(taskMain, locale)}】
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
                        <span className="ml-0 font-medium">{taskMain?.processDurationSeconds ? `${t('conversion.targetDuration')}：${miao2Hms(taskMain?.processDurationSeconds)} ` : "-"}</span>
                      </div>

                      <div className="flex justify-between items-end">
                        <span className="inline-block font-medium">{`${t('conversion.startTime')}：${formatDate(taskMain?.startedAt || "")}`}</span>
                        {/* 操作按钮 - 右下角 */}
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm"
                            disabled={taskMain?.status !== "completed"}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDownLoadClick(e, taskMain);
                            }}>
                            <Download className="size-4" />
                            {t('buttons.download')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={taskMain?.status !== "completed"}
                            onClick={(e) => {
                              e.stopPropagation();
                              onSonItemEditClick(taskMain?.id);
                            }}>
                            <Edit2 className="size-4" />
                            {t('buttons.edit')}
                          </Button>
                          <Button variant="outline" size="sm" onClick={(e) => {
                            e.stopPropagation();
                            onProgressClick(taskMain?.id, "1");
                          }}>
                            <ListOrdered className="size-4" />
                            {t('buttons.progress')}
                          </Button>
                          <Button variant="destructive" size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDevelopClick();
                            }}>
                            <BookmarkX className="size-4" />
                            {t('buttons.cancel')}
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
                        {t('conversion.progress')} <CircleEllipsis className="size-4" />
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
                      {steps.map((step, index) => {
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
                      {t('conversion.basicInfo')} <CircleEllipsis className="size-4" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">{t('conversion.targetLanguage')}</p>
                        <p className="font-medium">{getLanguageMapStr(taskMain.targetLanguage, locale)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">{t('conversion.targetDuration')}</p>
                        <p className="font-medium">{miao2Hms(taskMain?.processDurationSeconds)} </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">{t('conversion.startTime')}</p>
                        <p className="font-medium">{formatDate(taskMain?.startedAt || "")}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">{t('conversion.endTime')}</p>
                        <p className="font-medium">{formatDate(taskMain?.completedAt || "")}</p>
                      </div>
                    </div>

                    {/* 分隔虚线 */}
                    <div aria-hidden
                      className="mt-8 mb-0 h-px min-w-0 [background-image:linear-gradient(90deg,var(--color-foreground)_1px,transparent_1px)] bg-[length:6px_1px] bg-repeat-x opacity-25" />

                    {/* 底部 */}
                    <div className="flex space-y-0 gap-6">
                      <div className="flex-1 gap-6 mt-5 mb-5">
                        <p className="text-primary text-lg text-muted-foreground text-center">{t('audio.title')}</p>
                        <p className="text-sm text-muted-foreground my-5 text-center">{t('audio.description')}</p>
                        <div className="flex justify-around mt-2 gap-2">
                          <Button variant="outline" size="sm"
                            disabled={taskMain?.status !== "completed"}
                            onClick={(e) => {
                              e.stopPropagation();
                              onAudioClick(taskMain, 'preview');
                            }}>
                            <Share2 className="size-4" />
                            {t('audio.preview')}
                          </Button>
                          <Button variant="outline" size="sm"
                            disabled={taskMain?.status !== "completed"}
                            onClick={(e) => {
                              e.stopPropagation();
                              onAudioClick(taskMain, 'subtitle');
                            }}>
                            <Download className="size-4" />
                            {t('audio.download')}
                          </Button>
                          <Button variant="outline" size="sm"
                            disabled={taskMain?.status !== "completed"}
                            onClick={(e) => {
                              e.stopPropagation();
                              onAudioClick(taskMain, 'background');
                            }}>
                            <Download className="size-4" />
                            {t('audio.downloadBg')}
                          </Button>
                        </div>
                      </div>

                      {/* 分隔虚线 */}
                      <div aria-hidden
                        className="my-0 min-h-full min-w-1 [background-image:linear-gradient(0deg,var(--color-foreground)_1px,transparent_1px)] bg-[length:1px_6px] bg-repeat-y opacity-25" />

                      <div className="flex-1 gap-6 mt-5 mb-5">
                        <p className="text-primary text-lg text-muted-foreground text-center">{t('subtitle.title')}</p>
                        <p className="text-sm text-muted-foreground my-5 text-center">{t('subtitle.description')}</p>
                        <div className="flex justify-around mt-2 gap-2">
                          <Button variant="outline" size="sm"
                            disabled={taskMain?.status !== "completed"}
                            onClick={(e) => {
                              e.stopPropagation();
                              onCompareClick();
                            }}>
                            <Edit className="size-4" />
                            {t('subtitle.compare')}
                          </Button>
                          <Button variant="outline" size="sm"
                            disabled={taskMain?.status !== "completed"}
                            onClick={(e) => onDownloadSrtClick(e, 'gen_srt')}>
                            <Download className="size-4" />
                            {t('subtitle.download_yuan')}
                          </Button>
                          <Button variant="outline" size="sm"
                            disabled={taskMain?.status !== "completed"}
                            onClick={(e) => onDownloadSrtClick(e, 'translate_srt')}>
                            <Download className="size-4" />
                            {t('subtitle.download_tran')}
                          </Button>
                          <Button variant="outline" size="sm"
                            disabled={taskMain?.status !== "completed"}
                            onClick={(e) => onDownloadSrtClick(e, 'double_srt')}>
                            <Download className="size-4" />
                            {t('subtitle.download_double')}
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
