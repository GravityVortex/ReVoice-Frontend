'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Loader2,
  MoreHorizontal,
  Pencil,
  Trash2,
  XCircle,
  Waves,
  Captions,
  ListOrdered,
  Film,
  Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';

import { AudioPlayModal } from '@/shared/blocks/video-convert/Audio-play-modal';
import { CompareSrtModal } from '@/shared/blocks/video-convert/compare-srt-modal';
import { ProjectUpdateModal } from '@/shared/blocks/video-convert/project-update-modal';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { cn, formatDate, getAudioR2PathName, getLanguageConvertStr, getPreviewCoverUrl, getVideoR2PathName, miao2Hms } from '@/shared/lib/utils';

interface VideoDetail {
  id: string;
  userId: string;
  fileName: string;
  fileSizeBytes: number;
  videoDurationSeconds: number;
  createdAt: string;
  coverR2Key?: string | null;
  r2Key: string;
  cover?: string;
}

interface TaskFinalFile {
  taskId: string;
  fileType: string;
  r2Key: string;
  r2Bucket: string;
}

interface TaskMain {
  id: string;
  status: string;
  progress: number;
  currentStep: string | null;
  sourceLanguage: string;
  targetLanguage: string;
  speakerCount: string;
  processDurationSeconds: number;
  creditsConsumed?: number;
  errorMessage?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt?: string;
  finalFileList?: TaskFinalFile[];
}

interface ProgressStep {
  stepName: string;
  stepStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  startedAt?: string;
  completedAt?: string;
  errorMessage?: string;
}

function isRunningStatus(status: string | undefined) {
  return status === 'pending' || status === 'processing';
}

function getSpeakerLabel(t: (key: string) => string, speakerCount?: string) {
  if (speakerCount === 'single') return t('progressModal.overview.single');
  if (speakerCount === 'multiple') return t('progressModal.overview.multiple');
  return speakerCount || '-';
}

function getStepLabelByCurrentStep(tSteps: (key: string) => string, currentStep?: string | null) {
  if (!currentStep) return '';
  if (currentStep === 'split_audio_video') return tSteps('audioVideoSeparation');
  if (currentStep === 'split_vocal_bkground') return tSteps('vocalBackgroundSeparation');
  if (currentStep === 'gen_srt') return tSteps('generateSubtitles');
  if (currentStep === 'translate_srt') return tSteps('translateSubtitles');
  if (currentStep === 'split_audio') return tSteps('audioSlicing');
  if (currentStep === 'tts') return tSteps('voiceSynthesis');
  if (currentStep === 'adj_audio_time') return tSteps('audioAlignment');
  if (currentStep === 'merge_audios') return tSteps('mergeAudio');
  if (currentStep === 'merge_audio_video') return tSteps('mergeVideo');
  return currentStep;
}

function getStepLabelByProgress(tSteps: (key: string) => string, progress?: number) {
  const p = progress ?? 0;
  if (p >= 0 && p <= 11) return tSteps('audioVideoSeparation');
  if (p >= 12 && p <= 22) return tSteps('vocalBackgroundSeparation');
  if (p >= 23 && p <= 33) return tSteps('generateSubtitles');
  if (p >= 34 && p <= 44) return tSteps('translateSubtitles');
  if (p >= 45 && p <= 55) return tSteps('audioSlicing');
  if (p >= 56 && p <= 66) return tSteps('voiceSynthesis');
  if (p >= 67 && p <= 77) return tSteps('audioAlignment');
  if (p >= 78 && p <= 88) return tSteps('mergeAudio');
  if (p >= 89 && p <= 100) return tSteps('mergeVideo');
  return '';
}

function getStepLabelByStepName(tSteps: (key: string) => string, stepName: string) {
  if (stepName === 'split_audio_video') return tSteps('audioVideoSeparation');
  if (stepName === 'split_vocal_bkground') return tSteps('vocalBackgroundSeparation');
  if (stepName === 'gen_srt') return tSteps('generateSubtitles');
  if (stepName === 'translate_srt') return tSteps('translateSubtitles');
  if (stepName === 'split_audio') return tSteps('audioSlicing');
  if (stepName === 'tts') return tSteps('voiceSynthesis');
  if (stepName === 'adj_audio_time') return tSteps('audioAlignment');
  if (stepName === 'merge_audios') return tSteps('mergeAudio');
  if (stepName === 'merge_audio_video') return tSteps('mergeVideo');
  return stepName;
}

function getStepStatusMeta(stepStatus: ProgressStep['stepStatus']) {
  if (stepStatus === 'completed') {
    return { Icon: CheckCircle2, className: 'text-green-600' };
  }
  if (stepStatus === 'processing') {
    return { Icon: Loader2, className: 'text-orange-500 animate-spin' };
  }
  if (stepStatus === 'failed') {
    return { Icon: XCircle, className: 'text-red-500' };
  }
  if (stepStatus === 'cancelled') {
    return { Icon: XCircle, className: 'text-muted-foreground' };
  }
  return { Icon: Clock, className: 'text-muted-foreground' };
}

export function ProjectDetailView({
  fileId,
  locale,
  backHref,
  createHref,
}: {
  fileId: string;
  locale: string;
  backHref: string;
  createHref?: string;
}) {
  const router = useRouter();
  const t = useTranslations('video_convert.projectDetail');
  const tSteps = useTranslations('video_convert.projectDetail.steps');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const [videoDetail, setVideoDetail] = useState<VideoDetail | null>(null);
  const [taskList, setTaskList] = useState<TaskMain[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');

  // Preview source selection
  const [videoMode, setVideoMode] = useState<'result' | 'preview' | 'original'>('result');
  const urlCacheRef = useRef<Map<string, string>>(new Map());
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);

  const sideScrollRef = useRef<HTMLDivElement>(null);

  // Progress (inline)
  const progressCardRef = useRef<HTMLDivElement>(null);
  const [progressExpanded, setProgressExpanded] = useState(false);
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
  const [progressStepsLoading, setProgressStepsLoading] = useState(false);
  const [progressStepsFetched, setProgressStepsFetched] = useState(false);

  const [runsExpanded, setRunsExpanded] = useState(false);

  // Modals
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [projectItem, setProjectItem] = useState<Record<string, any>>({});
  const [isCompareDialogOpen, setIsCompareDialogOpen] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Audio modal state
  const audioRef = useRef<HTMLAudioElement>(null);
  const [showAudioModal, setShowAudioModal] = useState(false);
  const [isAudioModalLoading, setIsAudioModalLoading] = useState(true);
  const [subtitleAudioUrl, setSubtitleAudioUrl] = useState('');
  const [backgroundAudioUrl, setBackgroundAudioUrl] = useState('');

  const selectedTask = useMemo(
    () => taskList.find((t) => t.id === selectedTaskId) || null,
    [taskList, selectedTaskId]
  );

  const statusMeta = useMemo(() => {
    const status = selectedTask?.status || 'pending';
    const map: Record<string, { label: string; badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline'; badgeClassName?: string }> = {
      pending: { label: t('status.pending'), badgeVariant: 'outline', badgeClassName: 'text-cyan-600 border-cyan-600/20 bg-cyan-500/5' },
      processing: { label: t('status.processing'), badgeVariant: 'outline', badgeClassName: 'text-orange-500 border-orange-500/20 bg-orange-500/5' },
      completed: { label: t('status.completed'), badgeVariant: 'outline', badgeClassName: 'text-green-600 border-green-600/20 bg-green-500/5' },
      failed: { label: t('status.failed'), badgeVariant: 'outline', badgeClassName: 'text-red-500 border-red-500/20 bg-red-500/5' },
      cancelled: { label: t('status.cancelled'), badgeVariant: 'outline', badgeClassName: 'text-muted-foreground' },
    };
    return map[status] || { label: status, badgeVariant: 'outline' };
  }, [selectedTask?.status, t]);

  const canUseOutputs = selectedTask?.status === 'completed';

  const originalVideoKey = useMemo(() => {
    if (!videoDetail?.userId || !videoDetail?.id || !videoDetail?.r2Key) return '';
    return getVideoR2PathName(videoDetail.userId, videoDetail.id, videoDetail.r2Key);
  }, [videoDetail?.userId, videoDetail?.id, videoDetail?.r2Key]);

  const taskPreviewKey = useMemo(() => {
    if (!videoDetail?.userId || !selectedTask?.id) return '';
    const r2Key = selectedTask.finalFileList?.find((f) => f.fileType === 'preview')?.r2Key;
    if (!r2Key) return '';
    return getVideoR2PathName(videoDetail.userId, selectedTask.id, r2Key);
  }, [videoDetail?.userId, selectedTask?.id, selectedTask?.finalFileList]);

  const taskResultKey = useMemo(() => {
    if (!videoDetail?.userId || !selectedTask?.id) return '';
    const r2Key = selectedTask.finalFileList?.find((f) => f.fileType === 'video')?.r2Key;
    if (!r2Key) return '';
    return getVideoR2PathName(videoDetail.userId, selectedTask.id, r2Key);
  }, [videoDetail?.userId, selectedTask?.id, selectedTask?.finalFileList]);

  const activeVideoKey = useMemo(() => {
    if (videoMode === 'original') return originalVideoKey;
    if (videoMode === 'preview') return taskPreviewKey;
    return taskResultKey;
  }, [videoMode, originalVideoKey, taskPreviewKey, taskResultKey]);

  const fetchPrivateUrl = useCallback(async (key: string) => {
    const cached = urlCacheRef.current.get(key);
    if (cached) return cached;

    const res = await fetch(`/api/storage/privater2-url?key=${encodeURIComponent(key)}`);
    const data = await res.json();
    if (data?.code !== 0) {
      throw new Error(data?.message || 'Failed to get private url');
    }
    urlCacheRef.current.set(key, data.data.url);
    return data.data.url as string;
  }, []);

  // Fetch detail
  useEffect(() => {
    const run = async () => {
      if (!fileId) return;
      setLoading(true);
      setError('');
      setProgressExpanded(false);
      setRunsExpanded(false);
      try {
        const response = await fetch(`/api/video-task/detail?fileId=${fileId}`);
        const backJO = await response.json();
        if (backJO?.code !== 0) {
          setError(backJO?.message || '获取视频详情失败');
          return;
        }

        const tempItem = backJO.data.videoItem;
        const pre = backJO.data.preUrl || '';
        setVideoDetail({
          ...tempItem,
          cover: getPreviewCoverUrl(tempItem, pre),
        });
        const list: TaskMain[] = backJO.data.taskList || [];
        setTaskList(list);

        setSelectedTaskId((prev) => {
          if (prev && list.some((t) => t.id === prev)) return prev;
          const completed = list.filter((t) => t.status === 'completed');
          const processing = list.filter((t) => isRunningStatus(t.status));
          const byTimeDesc = (a: TaskMain, b: TaskMain) =>
            new Date(b.createdAt || b.completedAt || 0).getTime() - new Date(a.createdAt || a.completedAt || 0).getTime();
          const pick = (arr: TaskMain[]) => arr.slice().sort(byTimeDesc)[0]?.id;
          return pick(completed) || pick(processing) || list[0]?.id || '';
        });
      } catch (e) {
        console.error('[ProjectDetailView] Failed to fetch detail:', e);
        setError('获取视频详情失败');
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [fileId]);

  // Keep the internal right-column scroll position stable; reset on entry/fileId.
  // Use layout effect to avoid visible scroll jumps.
  useLayoutEffect(() => {
    sideScrollRef.current?.scrollTo({ top: 0, left: 0 });
  }, [fileId]);

  // Keep video mode sane when selected task changes.
  useEffect(() => {
    if (!selectedTask) {
      setVideoMode('original');
      return;
    }
    // Prefer result when available; otherwise fall back to original.
    if (!taskResultKey && videoMode === 'result') setVideoMode('original');
    if (!taskPreviewKey && videoMode === 'preview') setVideoMode(taskResultKey ? 'result' : 'original');
  }, [selectedTask?.id, taskResultKey, taskPreviewKey, videoMode]);

  // Fetch active video URL
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!activeVideoKey) {
        setPreviewUrl('');
        return;
      }
      if (activeVideoKey.startsWith('http')) {
        setPreviewUrl(activeVideoKey);
        return;
      }

      setPreviewLoading(true);
      try {
        const url = await fetchPrivateUrl(activeVideoKey);
        if (!cancelled) setPreviewUrl(url);
      } catch (e) {
        console.error('[ProjectDetailView] Failed to fetch video url:', e);
        if (!cancelled) setPreviewUrl('');
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [activeVideoKey, fetchPrivateUrl]);

  const updateTaskInList = useCallback((incoming: Partial<TaskMain> & { id: string }) => {
    setTaskList((prev) =>
      prev.map((t) =>
        t.id === incoming.id
          ? {
              ...t,
              ...incoming,
              // Preserve final outputs from detail endpoint.
              finalFileList: t.finalFileList,
            }
          : t
      )
    );
  }, []);

  // Poll selected task when it is running and modal isn't open.
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const stopPolling = useCallback(() => {
    if (!pollingTimerRef.current) return;
    clearInterval(pollingTimerRef.current);
    pollingTimerRef.current = null;
  }, []);

  const pollSelectedTask = useCallback(async ({ includeProgressList }: { includeProgressList: boolean }) => {
    if (!selectedTaskId) return false;
    try {
      const response = await fetch(
        includeProgressList
          ? `/api/video-task/getTaskProgress?taskId=${selectedTaskId}&progress=true`
          : `/api/video-task/getTaskProgress?taskId=${selectedTaskId}`
      );
      const result = await response.json();
      if (result?.code === 0 && result?.data?.taskItem?.id) {
        updateTaskInList(result.data.taskItem);
      }
      if (includeProgressList) {
        const list: ProgressStep[] = Array.isArray(result?.data?.progressList) ? result.data.progressList : [];
        setProgressSteps(list);
        setProgressStepsFetched(true);
      }
      return result?.code === 0;
    } catch (e) {
      // Silent: polling should never spam toasts.
      console.warn('[ProjectDetailView] Poll failed:', e);
      return false;
    }
  }, [selectedTaskId, updateTaskInList]);

  useEffect(() => {
    stopPolling();

    const status = selectedTask?.status;
    if (!selectedTaskId || !isRunningStatus(status)) return;

    void pollSelectedTask({ includeProgressList: progressExpanded });
    pollingTimerRef.current = setInterval(() => {
      void pollSelectedTask({ includeProgressList: progressExpanded });
    }, 15000);
    return stopPolling;
  }, [pollSelectedTask, progressExpanded, selectedTask?.status, selectedTaskId, stopPolling]);

  const fetchProgressStepsOnce = useCallback(async () => {
    if (!selectedTaskId) return;
    setProgressStepsLoading(true);
    try {
      const ok = await pollSelectedTask({ includeProgressList: true });
      if (!ok) {
        toast.error(t('ui.progressLoadFailed'));
      }
    } catch (e) {
      console.error('[ProjectDetailView] Progress fetch failed:', e);
      toast.error(t('ui.progressLoadFailed'));
    } finally {
      setProgressStepsLoading(false);
    }
  }, [pollSelectedTask, selectedTaskId, t]);

  useEffect(() => {
    if (!progressExpanded) return;
    // Running tasks are already polled (and will pull steps when expanded).
    if (isRunningStatus(selectedTask?.status)) return;
    void fetchProgressStepsOnce();
  }, [fetchProgressStepsOnce, progressExpanded, selectedTask?.status]);

  useEffect(() => {
    setProgressSteps([]);
    setProgressStepsLoading(false);
    setProgressStepsFetched(false);
  }, [selectedTaskId]);

  const handleDownloadVideo = useCallback(async () => {
    if (!selectedTask?.id) return;
    if (selectedTask.status !== 'completed') return;
    try {
      const response = await fetch(`/api/video-task/download-video?taskId=${selectedTask.id}&expiresIn=60`);
      const data = await response.json();
      if (data?.code !== 0) {
        toast.error(data?.message || '获取下载链接失败');
        return;
      }

      const link = document.createElement('a');
      link.href = data.data.url;
      link.download = videoDetail?.fileName || 'video.mp4';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error('[ProjectDetailView] Download failed:', e);
      toast.error('下载失败，请稍后重试');
    }
  }, [selectedTask?.id, selectedTask?.status, videoDetail?.fileName]);

  const doDownloadAudio = useCallback(
    async (type: 'subtitle' | 'background') => {
      if (!selectedTask?.id || !videoDetail?.userId) return;
      if (!canUseOutputs) return;

      const key =
        type === 'background'
          ? getAudioR2PathName(videoDetail.userId, selectedTask.id, 'split_vocal_bkground/audio/audio_bkground.wav')
          : getAudioR2PathName(videoDetail.userId, selectedTask.id, 'merge_audios/audio/audio_new.wav');

      try {
        const response = await fetch(`/api/video-task/download-audio?taskId=${selectedTask.id}&key=${encodeURIComponent(key)}&expiresIn=60`);
        const data = await response.json();
        if (data?.code !== 0) {
          toast.error(data?.message || '获取下载链接失败');
          return;
        }
        const link = document.createElement('a');
        link.href = data.data.url;
        link.download = `${type}_${videoDetail.fileName || selectedTask.id}.wav`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (e) {
        console.error('[ProjectDetailView] Audio download failed:', e);
        toast.error('下载失败，请稍后重试');
      }
    },
    [canUseOutputs, selectedTask?.id, videoDetail?.fileName, videoDetail?.userId]
  );

  const handleOpenAudioPreview = useCallback(async () => {
    if (!selectedTask?.id || !videoDetail?.userId) return;
    if (!canUseOutputs) return;

    setShowAudioModal(true);
    setIsAudioModalLoading(true);
    try {
      const bgKey = getAudioR2PathName(videoDetail.userId, selectedTask.id, 'split_vocal_bkground/audio/audio_bkground.wav');
      const newKey = getAudioR2PathName(videoDetail.userId, selectedTask.id, 'merge_audios/audio/audio_new.wav');
      const [bgUrl, newUrl] = await Promise.all([fetchPrivateUrl(bgKey), fetchPrivateUrl(newKey)]);
      setBackgroundAudioUrl(bgUrl);
      setSubtitleAudioUrl(newUrl);
    } catch (e) {
      console.error('[ProjectDetailView] Failed to load audio urls:', e);
      toast.error('获取音频失败，请稍后重试');
      setShowAudioModal(false);
    } finally {
      setIsAudioModalLoading(false);
    }
  }, [canUseOutputs, fetchPrivateUrl, selectedTask?.id, videoDetail?.userId]);

  const handleDownloadSrt = useCallback(
    async (stepName: 'gen_srt' | 'translate_srt' | 'double_srt') => {
      if (!selectedTask?.id) return;
      if (!canUseOutputs) return;
      try {
        const downloadUrl =
          stepName === 'double_srt'
            ? `/api/video-task/download-double-srt?taskId=${selectedTask.id}&stepName=${stepName}`
            : `/api/video-task/download-one-srt?taskId=${selectedTask.id}&stepName=${stepName}`;
        const response = await fetch(downloadUrl);
        if (!response.ok) {
          const err = await response.json();
          toast.error(err?.message || '下载字幕失败');
          return;
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${stepName}_${selectedTask.id}.srt`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } catch (e) {
        console.error('[ProjectDetailView] Subtitle download failed:', e);
        toast.error('下载字幕失败，请稍后重试');
      }
    },
    [canUseOutputs, selectedTask?.id]
  );

  const handleDelete = useCallback(async () => {
    if (!fileId) return;
    setShowDeleteDialog(false);
    try {
      const response = await fetch('/api/video-task/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskMainId: fileId }),
      });
      const result = await response.json();
      if (result?.code === 0) {
        toast.success('删除成功');
        router.push(backHref);
        return;
      }
      toast.error(result?.message || '删除失败');
    } catch (e) {
      console.error('[ProjectDetailView] Delete failed:', e);
      toast.error('删除失败，请稍后重试');
    }
  }, [backHref, fileId, router]);

  const handleProjectUpdateEvent = useCallback((changeItem: Record<string, any>) => {
    setVideoDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        fileName: changeItem.fileName ?? prev.fileName,
        cover: changeItem.cover ?? prev.cover,
      };
    });
  }, []);

  const handleOpenProgress = useCallback(() => {
    if (!selectedTask?.id) return;
    setProgressExpanded(true);
    // Ensure the card becomes visible inside the right-column scroll container.
    requestAnimationFrame(() => {
      progressCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [selectedTask?.id]);

  const handleOpenEditor = useCallback(() => {
    if (!selectedTask?.id) return;
    router.push(`/${locale}/video_convert/video-editor/${selectedTask.id}`);
  }, [locale, router, selectedTask?.id]);

  const stepLabel = useMemo(() => {
    if (!selectedTask) return '';
    return (
      getStepLabelByCurrentStep(tSteps, selectedTask.currentStep) ||
      getStepLabelByProgress(tSteps, selectedTask.progress) ||
      ''
    );
  }, [selectedTask, tSteps]);

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl flex flex-1 min-h-0 flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="h-6 w-64 rounded bg-muted animate-pulse" />
            <div className="h-4 w-80 rounded bg-muted animate-pulse" />
          </div>
          <div className="h-10 w-32 rounded bg-muted animate-pulse" />
        </div>
        <div className="grid flex-1 min-h-0 gap-6 items-stretch lg:grid-cols-[minmax(0,1fr)_420px] lg:grid-rows-[minmax(0,1fr)]">
          <div className="rounded-xl border bg-card p-6 flex min-h-0 flex-col">
            <div className="flex-1 min-h-0 rounded-lg bg-muted animate-pulse" />
            <div className="mt-4 h-10 w-72 rounded bg-muted animate-pulse" />
          </div>
          <div className="flex h-full min-h-0 flex-col gap-6">
            <div className="rounded-xl border bg-card p-6">
              <div className="h-10 w-64 rounded bg-muted animate-pulse" />
              <div className="mt-4 h-24 w-full rounded bg-muted animate-pulse" />
            </div>
            <div className="rounded-xl border bg-card p-6">
              <div className="h-6 w-40 rounded bg-muted animate-pulse" />
              <div className="mt-4 space-y-2">
                <div className="h-12 w-full rounded bg-muted animate-pulse" />
                <div className="h-12 w-full rounded bg-muted animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-2xl flex flex-1 min-h-0 flex-col justify-center">
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <p className="text-lg font-semibold text-destructive">{error}</p>
            <div className="pt-3">
              <Button variant="outline" asChild>
                <Link href={backHref}>{t('ui.back')}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sizeMb = ((videoDetail?.fileSizeBytes || 0) / 1024 / 1024).toFixed(2);
  const duration = videoDetail?.videoDurationSeconds ? miao2Hms(videoDetail.videoDurationSeconds) : '-';

  return (
    <div className="mx-auto w-full max-w-6xl flex flex-1 min-h-0 flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" className="shrink-0" asChild>
              <Link href={backHref} aria-label="Back">
                <ArrowLeft className="size-5" />
              </Link>
            </Button>
            <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">
              {videoDetail?.fileName || 'Project'}
            </h1>
            {selectedTask && (
              <Badge variant={statusMeta.badgeVariant} className={cn('ml-1', statusMeta.badgeClassName)}>
                {statusMeta.label}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Film className="size-4" />
              {duration}
            </span>
            <span>{sizeMb}MB</span>
            <span>{t('videoInfo.uploadTime')}: {formatDate(videoDetail?.createdAt || '')}</span>
            {selectedTask && (
              <span className="inline-flex items-center gap-1">
                <Sparkles className="size-4" />
                {getLanguageConvertStr(selectedTask, locale)} · {getSpeakerLabel(t, selectedTask.speakerCount)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedTask ? (
            <Button
              onClick={() => {
                if (selectedTask.status === 'completed') void handleDownloadVideo();
                else handleOpenProgress();
              }}
              disabled={!selectedTask?.id || (selectedTask.status === 'completed' ? false : !isRunningStatus(selectedTask.status) && selectedTask.status !== 'failed')}
            >
              {selectedTask.status === 'completed' ? (
                <>
                  <Download className="mr-2 size-4" />
                  {t('buttons.download')}
                </>
              ) : (
                <>
                  <ListOrdered className="mr-2 size-4" />
                  {t('buttons.progress')}
                </>
              )}
            </Button>
          ) : (
            createHref && (
              <Button asChild>
                <Link href={createHref}>{t('ui.startConvert')}</Link>
              </Button>
            )
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => {
                  setProjectItem({ ...(videoDetail || {}) });
                  setIsEditDialogOpen(true);
                }}
              >
                <Pencil className="size-4" />
                {t('menu.editInfo')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                <Trash2 className="size-4" />
                {t('menu.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main */}
      <div className="grid flex-1 min-h-0 gap-6 items-stretch lg:grid-cols-[minmax(0,1fr)_420px] lg:grid-rows-[minmax(0,1fr)]">
        {/* Preview */}
        <Card className="h-full overflow-hidden flex min-h-0 flex-col">
          <CardHeader className="pb-4">
            <CardTitle className="text-base uppercase tracking-widest text-muted-foreground font-semibold">
              {t('ui.preview')}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-1 min-h-0 flex-col gap-4">
            <div className="relative w-full flex-1 min-h-0 overflow-hidden rounded-lg bg-black">
              {previewLoading ? (
                <div className="flex h-full w-full items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-white/70" />
                </div>
              ) : previewUrl ? (
                <video
                  key={previewUrl}
                  src={previewUrl}
                  controls
                  className="h-full w-full object-contain"
                  controlsList="nodownload"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted">
                  {videoDetail?.cover ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={videoDetail.cover}
                      alt={videoDetail.fileName || 'cover'}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src = '/imgs/cover_video_def.jpg';
                      }}
                    />
                  ) : (
                    <div className="text-sm text-muted-foreground">{t('ui.noPreview')}</div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Tabs value={videoMode} onValueChange={(v) => setVideoMode(v as typeof videoMode)}>
                <TabsList className="h-9">
                  <TabsTrigger value="result" disabled={!taskResultKey}>
                    {t('ui.mode.result')}
                  </TabsTrigger>
                  <TabsTrigger value="preview" disabled={!taskPreviewKey}>
                    {t('ui.mode.preview')}
                  </TabsTrigger>
                  <TabsTrigger value="original" disabled={!originalVideoKey}>
                    {t('ui.mode.original')}
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground">
                  <Waves className="size-3" />
                  {t('ui.features.vocalSplit')}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground">
                  <Captions className="size-3" />
                  {t('ui.features.bilingualSubtitles')}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Side */}
        <div
          ref={sideScrollRef}
          className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto pr-2 overscroll-contain"
          style={{ overflowAnchor: 'none' }}
        >
          {/* Progress */}
          <div ref={progressCardRef}>
            <Collapsible open={progressExpanded} onOpenChange={setProgressExpanded}>
              <Card className="py-4 gap-4">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    <CardTitle className="text-base uppercase tracking-widest text-muted-foreground font-semibold">
                      {t('conversion.progress')}
                    </CardTitle>
                    <CollapsibleTrigger asChild>
                      <Button variant="outline" size="sm" disabled={!selectedTask?.id}>
                        <span className="mr-2">{t('buttons.progress')}</span>
                        <ChevronDown className={cn('size-4 transition-transform', progressExpanded && 'rotate-180')} />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      {selectedTask ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={statusMeta.badgeVariant} className={cn(statusMeta.badgeClassName)}>
                            {statusMeta.label}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {selectedTask.progress}%
                            {stepLabel ? ` · ${stepLabel}` : ''}
                          </span>
                        </div>
                      ) : (
                        <div className="h-5 w-36 rounded bg-muted animate-pulse" />
                      )}

                      {selectedTask?.status === 'failed' && selectedTask.errorMessage && (
                        <div className="line-clamp-2 text-sm text-destructive">{selectedTask.errorMessage}</div>
                      )}
                    </div>

                    {selectedTask && (
                      <div className="shrink-0 text-2xl font-bold text-primary">{selectedTask.progress}%</div>
                    )}
                  </div>

                  <div className="h-2 w-full rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary/70" style={{ width: `${selectedTask?.progress ?? 0}%` }} />
                  </div>

                  <CollapsibleContent>
                    <div className="border-t pt-4">
                      {!selectedTask ? (
                        <div className="text-sm text-muted-foreground">{t('progressModal.loading')}</div>
                      ) : progressStepsLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" />
                          {t('progressModal.loadingData')}
                        </div>
                      ) : !progressStepsFetched ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="size-4 animate-spin" />
                          {t('progressModal.loadingData')}
                        </div>
                      ) : progressSteps.length === 0 ? (
                        <div className="text-sm text-muted-foreground">
                          {selectedTask.status === 'failed' ? t('ui.progressEmptyFailed') : t('ui.progressEmpty')}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {progressSteps.map((s) => {
                            const meta = getStepStatusMeta(s.stepStatus);
                            const Icon = meta.Icon;
                            const label = getStepLabelByStepName(tSteps, s.stepName);
                            return (
                              <div key={`${s.stepName}-${s.startedAt || ''}-${s.completedAt || ''}`} className="flex gap-3">
                                <div className="mt-0.5 shrink-0">
                                  <Icon className={cn('size-4', meta.className)} />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                    <div className="font-medium text-foreground">{label}</div>
                                    <div className="text-xs text-muted-foreground">
                                      {s.completedAt
                                        ? `${formatDate(s.completedAt)}`
                                        : s.startedAt
                                          ? `${formatDate(s.startedAt)}`
                                          : ''}
                                    </div>
                                  </div>
                                  {s.errorMessage && <div className="mt-1 text-sm text-destructive">{s.errorMessage}</div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </CardContent>
              </Card>
            </Collapsible>
          </div>

          {/* Outputs */}
          <Card className="flex flex-col py-4 gap-4">
            <CardHeader className="pb-4">
              <CardTitle className="text-base uppercase tracking-widest text-muted-foreground font-semibold">
                {t('ui.outputs')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="video">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="video">{t('ui.tabs.video')}</TabsTrigger>
                  <TabsTrigger value="audio">{t('audio.title')}</TabsTrigger>
                  <TabsTrigger value="subtitle">{t('subtitle.title')}</TabsTrigger>
                </TabsList>

                <TabsContent value="video" className="space-y-4">
                  <div className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="font-medium">{t('ui.finalVideo.title')}</div>
                        <div className="text-sm text-muted-foreground">{t('ui.finalVideo.description')}</div>
                      </div>
                      <Button variant="outline" disabled={!canUseOutputs} onClick={handleDownloadVideo}>
                        <Download className="mr-2 size-4" />
                        {t('buttons.download')}
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" disabled={!canUseOutputs} onClick={handleOpenEditor}>
                        <Pencil className="mr-2 size-4" />
                        {t('buttons.edit')}
                      </Button>
                      <Button variant="outline" size="sm" disabled={!selectedTask?.id} onClick={handleOpenProgress}>
                        <ListOrdered className="mr-2 size-4" />
                        {t('buttons.progress')}
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="audio" className="space-y-4">
                  <div className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="font-medium">{t('audio.title')}</div>
                        <div className="text-sm text-muted-foreground">{t('audio.description')}</div>
                      </div>
                      <Button variant="outline" disabled={!canUseOutputs} onClick={handleOpenAudioPreview}>
                        <Waves className="mr-2 size-4" />
                        {t('audio.preview')}
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" disabled={!canUseOutputs} onClick={() => void doDownloadAudio('subtitle')}>
                        <Download className="mr-2 size-4" />
                        {t('audio.download')}
                      </Button>
                      <Button variant="outline" size="sm" disabled={!canUseOutputs} onClick={() => void doDownloadAudio('background')}>
                        <Download className="mr-2 size-4" />
                        {t('audio.downloadBg')}
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="subtitle" className="space-y-4">
                  <div className="rounded-lg border p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="font-medium">{t('subtitle.title')}</div>
                        <div className="text-sm text-muted-foreground">{t('subtitle.description')}</div>
                      </div>
                      <Button variant="outline" disabled={!canUseOutputs} onClick={() => setIsCompareDialogOpen(true)}>
                        <Captions className="mr-2 size-4" />
                        {t('subtitle.compare')}
                      </Button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" disabled={!canUseOutputs}>
                            <Download className="mr-2 size-4" />
                            {t('ui.downloadSubtitles')}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-44">
                          <DropdownMenuItem onClick={() => void handleDownloadSrt('gen_srt')}>
                            {t('subtitle.download_yuan')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void handleDownloadSrt('translate_srt')}>
                            {t('subtitle.download_tran')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => void handleDownloadSrt('double_srt')}>
                            {t('subtitle.download_double')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Runs */}
          <Card className="flex flex-1 flex-col py-4 gap-4">
            <Collapsible open={runsExpanded} onOpenChange={setRunsExpanded}>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base uppercase tracking-widest text-muted-foreground font-semibold">
                    {t('ui.runs')}
                  </CardTitle>
                  {taskList.length > 1 && (
                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <span className="mr-2">{taskList.length}</span>
                        <ChevronDown className={cn('size-4 transition-transform', runsExpanded && 'rotate-180')} />
                      </Button>
                    </CollapsibleTrigger>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-2">
                {taskList.length === 0 ? (
                  <div className="rounded-lg border bg-muted/20 p-6 text-center">
                    <div className="text-sm text-muted-foreground">{t('ui.emptyRuns')}</div>
                    {createHref && (
                      <div className="mt-3">
                        <Button asChild>
                          <Link href={createHref}>{t('ui.startConvert')}</Link>
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {!runsExpanded && selectedTask && (
                      <button
                        key={selectedTask.id}
                        type="button"
                        onClick={() => setRunsExpanded(true)}
                        className="w-full rounded-lg border p-3 text-left transition-colors hover:bg-muted/30"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate font-medium text-foreground">
                              {getLanguageConvertStr(selectedTask, locale)} · {getSpeakerLabel(t, selectedTask.speakerCount)}
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <Badge variant="outline" className={cn('justify-end', statusMeta.badgeClassName)}>
                              {statusMeta.label}
                            </Badge>
                            {isRunningStatus(selectedTask.status) && (
                              <div className="mt-1 font-mono text-xs text-muted-foreground">{selectedTask.progress}%</div>
                            )}
                          </div>
                        </div>

                        {isRunningStatus(selectedTask.status) && (
                          <div className="mt-3 h-1.5 w-full rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary/60" style={{ width: `${selectedTask.progress}%` }} />
                          </div>
                        )}
                      </button>
                    )}

                    <CollapsibleContent className="space-y-2">
                      {taskList.map((task) => {
                        const selected = task.id === selectedTaskId;
                        const taskStatusMeta = (() => {
                          const map: Record<string, { label: string; cls?: string }> = {
                            pending: { label: t('status.pending'), cls: 'text-cyan-600 border-cyan-600/20 bg-cyan-500/5' },
                            processing: { label: t('status.processing'), cls: 'text-orange-500 border-orange-500/20 bg-orange-500/5' },
                            completed: { label: t('status.completed'), cls: 'text-green-600 border-green-600/20 bg-green-500/5' },
                            failed: { label: t('status.failed'), cls: 'text-red-500 border-red-500/20 bg-red-500/5' },
                            cancelled: { label: t('status.cancelled'), cls: 'text-muted-foreground' },
                          };
                          return map[task.status] || { label: task.status };
                        })();

                        return (
                          <button
                            key={task.id}
                            type="button"
                            onClick={() => setSelectedTaskId(task.id)}
                            className={cn(
                              'w-full rounded-lg border p-3 text-left transition-colors',
                              selected ? 'border-primary bg-primary/5' : 'hover:bg-muted/30'
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-medium text-foreground">
                                  {getLanguageConvertStr(task, locale)} · {getSpeakerLabel(t, task.speakerCount)}
                                </div>
                              </div>

                              <div className="shrink-0 text-right">
                                <Badge variant="outline" className={cn('justify-end', taskStatusMeta.cls)}>
                                  {taskStatusMeta.label}
                                </Badge>
                                {isRunningStatus(task.status) && (
                                  <div className="mt-1 font-mono text-xs text-muted-foreground">{task.progress}%</div>
                                )}
                              </div>
                            </div>

                            {isRunningStatus(task.status) && (
                              <div className="mt-3 h-1.5 w-full rounded-full bg-muted">
                                <div className="h-full rounded-full bg-primary/60" style={{ width: `${task.progress}%` }} />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </CollapsibleContent>
                  </>
                )}
              </CardContent>
            </Collapsible>
          </Card>
        </div>
      </div>

      {/* Modals */}
      <audio ref={audioRef} className="hidden" />

      <ProjectUpdateModal
        projectItem={projectItem}
        isOpen={isEditDialogOpen}
        onUpdateEvent={handleProjectUpdateEvent}
        onClose={() => setIsEditDialogOpen(false)}
      />

      <CompareSrtModal
        isOpen={isCompareDialogOpen}
        onClose={() => setIsCompareDialogOpen(false)}
        taskId={selectedTaskId}
        onDownBtnsClick={(e, stepName) => {
          e?.stopPropagation?.();
          if (stepName === 'gen_srt' || stepName === 'translate_srt' || stepName === 'double_srt') {
            void handleDownloadSrt(stepName);
          }
        }}
      />

      <AudioPlayModal
        audioRef={audioRef}
        isLoading={isAudioModalLoading}
        isOpen={showAudioModal}
        onClose={() => setShowAudioModal(false)}
        subtitleAudioUrl={subtitleAudioUrl}
        backgroundAudioUrl={backgroundAudioUrl}
      />

      {/* Delete confirmation */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteDialog.title')}</DialogTitle>
            <DialogDescription>{t('deleteDialog.description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              {t('deleteDialog.cancel')}
            </Button>
            <Button variant="destructive" onClick={() => void handleDelete()}>
              {t('deleteDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
