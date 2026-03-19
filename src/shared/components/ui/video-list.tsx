"use client";

import React, { useMemo, useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Play,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";

import { LangBadge } from "@/shared/components/ui/lang-badge";
import { estimateTaskPercent } from "@/shared/lib/task-progress";
import { cn, formatFullDate, timeAgo } from "@/shared/lib/utils";

export type VideoConversionStatus =
  | "pending"
  | "completed"
  | "processing"
  | "failed"
  | "cancelled"
  | "partial";

export interface VideoListItem {
  id: string;
  fileName: string;
  cover: string;
  videoUrl: string;
  status: VideoConversionStatus;
  duration?: string;
  convertedAt?: string;
  createdAt?: string;
  videoSize: number;
  tasks: Record<string, any>[] | null;
}

export interface VideoListProps {
  items: VideoListItem[];
  className?: string;
  cols?: 1 | 2 | 3 | 4 | 5 | 6;
  onVideoPlay?: (item: VideoListItem, index: number) => void;
  onItemClick?: (item: VideoListItem, index: number) => void;
  onStatusClick?: (item: VideoListItem, index: number) => void;
  locale?: string;
}

const statusConfig: Record<
  VideoConversionStatus,
  { badgeClassName: string; icon: React.ReactNode }
> = {
  pending: {
    badgeClassName:
      "bg-amber-500/10 text-amber-600 border-amber-200 dark:text-amber-300 dark:border-amber-500/20",
    icon: <Clock className="h-3 w-3" />,
  },
  processing: {
    badgeClassName:
      "bg-blue-500/10 text-blue-600 border-blue-200 dark:text-blue-300 dark:border-blue-500/20",
    icon: <Clock className="h-3 w-3 animate-spin" />,
  },
  completed: {
    badgeClassName:
      "bg-green-500/10 text-green-600 border-green-200 dark:text-green-300 dark:border-green-500/20",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  failed: {
    badgeClassName:
      "bg-red-500/10 text-red-600 border-red-200 dark:text-red-300 dark:border-red-500/20",
    icon: <AlertCircle className="h-3 w-3" />,
  },
  cancelled: {
    badgeClassName:
      "bg-zinc-500/10 text-zinc-600 border-zinc-200 dark:text-zinc-300 dark:border-zinc-500/20",
    icon: <XCircle className="h-3 w-3" />,
  },
  partial: {
    badgeClassName:
      "bg-amber-500/10 text-amber-600 border-amber-200 dark:text-amber-300 dark:border-amber-500/20",
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

const STEP_NAME_KEYS: Record<string, string> = {
  upload_complete: "stepName.uploadComplete",
  split_audio_video: "stepName.splitting",
  split_vocal_bkground: "stepName.splitting",
  gen_srt: "stepName.genSrt",
  translate_srt: "stepName.translateSrt",
  split_audio: "stepName.splitting",
  tts: "stepName.tts",
  adj_audio_time: "stepName.adjustAudio",
  merge_audios: "stepName.merging",
  merge_audio_video: "stepName.mergeVideo",
};

function getFriendlyStepName(
  t: (key: string) => string,
  currentStep?: string | null
) {
  if (!currentStep) return t("statusShort.processing");
  const step = String(currentStep).trim().toLowerCase();
  const key = STEP_NAME_KEYS[step];
  if (key) {
    try {
      return t(key);
    } catch {
      return t("statusShort.processing");
    }
  }
  return t("statusShort.processing");
}

function getAggregateStatus(tasks: Record<string, any>[] | null): {
  status: VideoConversionStatus;
  processingTask: Record<string, any> | null;
  taskCount: number;
  processingCount: number;
  completedCount: number;
} {
  if (!tasks || tasks.length === 0) {
    return { status: "pending", processingTask: null, taskCount: 0, processingCount: 0, completedCount: 0 };
  }

  let processingTask: Record<string, any> | null = null;
  let hasProcessing = false;
  let hasFailed = false;
  let hasCompleted = false;
  let allCompleted = true;
  let processingCount = 0;
  let completedCount = 0;

  for (const task of tasks) {
    const s = task.status;
    if (s === "processing") {
      hasProcessing = true;
      processingCount++;
      if (!processingTask) processingTask = task;
    }
    if (s === "pending") {
      hasProcessing = true;
      processingCount++;
      if (!processingTask) processingTask = task;
    }
    if (s === "failed") hasFailed = true;
    if (s === "completed") {
      hasCompleted = true;
      completedCount++;
    }
    if (s !== "completed") allCompleted = false;
  }

  if (hasProcessing) {
    const bestTask = tasks.find((t) => t.status === "processing") || processingTask;
    return { status: "processing", processingTask: bestTask, taskCount: tasks.length, processingCount, completedCount };
  }
  if (allCompleted) return { status: "completed", processingTask: null, taskCount: tasks.length, processingCount: 0, completedCount };
  if (hasCompleted && hasFailed) return { status: "partial", processingTask: null, taskCount: tasks.length, processingCount: 0, completedCount };
  if (hasFailed) return { status: "failed", processingTask: null, taskCount: tasks.length, processingCount: 0, completedCount };
  return { status: tasks[0].status || "pending", processingTask: null, taskCount: tasks.length, processingCount: 0, completedCount };
}

export function VideoList({
  items,
  className,
  cols = 3,
  onVideoPlay,
  onItemClick,
  onStatusClick,
  locale = "zh",
}: VideoListProps) {
  const t = useTranslations("video_convert.myVideoList");

  const colsClass = useMemo(() => {
    switch (cols) {
      case 1:
        return "grid-cols-1";
      case 2:
        return "grid-cols-1 sm:grid-cols-2";
      case 3:
        return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
      case 4:
        return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
      case 5:
        return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5";
      case 6:
        return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6";
      default:
        return "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";
    }
  }, [cols]);

  return (
    <div className={cn("grid gap-4 sm:gap-6", colsClass, className)}>
      {items.map((it, index) => (
        <GridVideoCard
          key={it.id}
          item={it}
          t={t}
          locale={locale}
          onPlay={() => onVideoPlay?.(it, index)}
          onCardContentClick={() => onItemClick?.(it, index)}
          onStatusClick={() => onStatusClick?.(it, index)}
        />
      ))}
    </div>
  );
}

interface GridVideoCardProps {
  item: VideoListItem;
  t: (key: string) => string;
  locale: string;
  onPlay: () => void;
  onCardContentClick: () => void;
  onStatusClick: () => void;
}

function useResolvedCover(cover?: string) {
  const [imgSrc, setImgSrc] = useState("/imgs/cover_video_def.jpg");

  useEffect(() => {
    if (!cover) {
      setImgSrc("/imgs/cover_video_def.jpg");
      return;
    }

    const img = new Image();
    img.src = cover;
    img.onload = () => setImgSrc(cover);
    img.onerror = () => setImgSrc("/imgs/cover_video_def.jpg");
  }, [cover]);

  return imgSrc;
}

function LangSummary({
  tasks,
  t,
  processingCount,
}: {
  tasks: Record<string, any>[] | null;
  t: (key: string) => string;
  processingCount: number;
}) {
  if (!tasks || tasks.length === 0) {
    return (
      <span className="text-xs text-muted-foreground/70 italic">
        {t("card.noTranslations")}
      </span>
    );
  }

  const sources = new Set(tasks.map((t) => t.sourceLanguage).filter(Boolean));
  const isSingleSource = sources.size <= 1;

  if (tasks.length === 1) {
    const task = tasks[0];
    return (
      <div className="flex items-center gap-1.5">
        <LangBadge code={task.sourceLanguage} size="sm" />
        <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
        <LangBadge code={task.targetLanguage} size="sm" />
      </div>
    );
  }

  if (tasks.length <= 3 && isSingleSource) {
    const sourceCode = tasks[0].sourceLanguage;
    return (
      <div className="flex items-center gap-1.5">
        <LangBadge code={sourceCode} size="sm" />
        <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
        {tasks.map((task, i) => (
          <LangBadge key={i} code={task.targetLanguage} size="sm" />
        ))}
      </div>
    );
  }

  return (
    <span className="text-xs text-muted-foreground">
      {tasks.length} {t("card.translations")}
      {processingCount > 0 && (
        <span className="text-blue-400">
          {" · "}
          {processingCount} {t("card.inProgress")}
        </span>
      )}
    </span>
  );
}

function GridVideoCard({
  item,
  t,
  locale,
  onPlay,
  onCardContentClick,
  onStatusClick,
}: GridVideoCardProps) {
  const { fileName, cover, duration, createdAt } = item;
  const imgSrc = useResolvedCover(cover);

  const { status, processingTask, taskCount, processingCount, completedCount } = useMemo(
    () => getAggregateStatus(item.tasks),
    [item.tasks]
  );

  const config = statusConfig[status] || statusConfig.pending;
  const isRunning = status === "processing" || status === "pending";
  const isCompleted = status === "completed";
  const isPartial = status === "partial";
  const isFailed = status === "failed" || status === "cancelled";

  const percent = useMemo(() => {
    if (!processingTask) return 0;
    return estimateTaskPercent({
      status: processingTask.status,
      progress: processingTask.progress,
      currentStep: processingTask.currentStep,
    });
  }, [processingTask]);

  const stepLabel = useMemo(() => {
    if (!processingTask) return "";
    return getFriendlyStepName(t, processingTask.currentStep);
  }, [processingTask, t]);

  const dateLabel = useMemo(() => {
    return timeAgo(createdAt || "", locale);
  }, [createdAt, locale]);

  const fullDate = useMemo(() => {
    return formatFullDate(createdAt || "", locale);
  }, [createdAt, locale]);

  return (
    <div
      className={cn(
        "group relative flex cursor-pointer flex-col gap-3 rounded-2xl border border-border/50 bg-card p-3 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/20 hover:shadow-lg",
        isFailed && "opacity-85"
      )}
      onClick={onCardContentClick}
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imgSrc}
          alt={fileName}
          onError={(e) => {
            e.currentTarget.src = "/imgs/cover_video_def.jpg";
          }}
          className={cn(
            "h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-105",
            isFailed && "brightness-75"
          )}
          loading="lazy"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

        {/* Status badge - only for non-completed states */}
        {!isCompleted && taskCount > 0 && (
          <div className="absolute right-2 top-2 flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStatusClick();
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm backdrop-blur-md transition-transform hover:scale-105",
                config.badgeClassName,
                "bg-white/90 dark:bg-black/60"
              )}
            >
              {config.icon}
              {status === "partial"
                ? `${t("statusShort.partial")} (${completedCount}/${taskCount})`
                : t(`statusShort.${status}`)}
            </button>
          </div>
        )}

        {/* Play button overlay for completed videos */}
        {isCompleted && (
          <div
            className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              onPlay();
            }}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-white/20 text-white shadow-xl backdrop-blur-md transition-transform hover:scale-110">
              <Play className="ml-0.5 h-5 w-5 fill-white" />
            </div>
          </div>
        )}

        {/* Duration overlay */}
        {duration && (
          <div className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            {duration}
          </div>
        )}

        {/* Progress bar for processing cards */}
        {isRunning && processingTask && (
          <div className="absolute inset-x-0 bottom-0">
            <div className="h-1 w-full bg-black/30 backdrop-blur-sm">
              <div
                className="h-full bg-blue-400 transition-all duration-500"
                style={{ width: `${Math.max(3, percent)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Card info section */}
      <div className="flex flex-col gap-1.5 px-1">
        <h3
          className="line-clamp-1 text-base font-semibold text-card-foreground transition-colors group-hover:text-primary"
          title={fileName}
        >
          {fileName}
        </h3>

        {/* Language pair summary */}
        <LangSummary tasks={item.tasks} t={t} processingCount={processingCount} />

        {/* Bottom row: status/step + date */}
        <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
          {isRunning && processingTask ? (
            <span className="flex items-center gap-1.5 text-blue-400">
              <Clock className="h-3 w-3 animate-spin" />
              <span className="truncate">
                {stepLabel}
                {percent > 0 && <span className="ml-1 font-mono">{percent}%</span>}
              </span>
            </span>
          ) : isFailed ? (
            <span className="text-red-400">{t("statusShort.failed")}</span>
          ) : isPartial ? (
            <span className="text-amber-500">{`${t("statusShort.partial")} (${completedCount}/${taskCount})`}</span>
          ) : taskCount === 0 ? (
            <span className="text-muted-foreground/60">{t("card.noTranslations")}</span>
          ) : (
            <span />
          )}
          <span
            className="flex shrink-0 items-center gap-1 cursor-default"
            title={fullDate}
          >
            <Clock className="h-3 w-3 opacity-50" />
            {dateLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

export default VideoList;
