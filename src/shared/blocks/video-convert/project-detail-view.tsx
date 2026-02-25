'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useRouter } from '@/core/i18n/navigation';
import { useTranslations } from 'next-intl';
import {
  ArrowLeft,
  ArrowRight,
  Download,
  Loader2,
  Languages,
  MoreHorizontal,
  Pencil,
  Repeat,
  Trash2,
  Users,
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
import { TaskStatusStepper } from '@/shared/blocks/video-convert/task-status-stepper';
import { Badge } from '@/shared/components/ui/badge';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Label } from '@/shared/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Skeleton } from '@/shared/components/ui/skeleton';
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
import { RetroGrid } from '@/shared/components/magicui/retro-grid';
import { cn, formatDate, getAudioR2PathName, getLanguageConvertStr, getPreviewCoverUrl, getVideoR2PathName, miao2Hms } from '@/shared/lib/utils';
import { usePausedVideoPrefetch } from '@/shared/hooks/use-paused-video-prefetch';

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

function isRunningStatus(status: string | undefined) {
  return status === 'pending' || status === 'processing';
}

function isNonBlockingDedupeStatus(status: string | undefined | null) {
  return status === 'failed' || status === 'cancelled';
}

function isBlockingDedupeStatus(status: string | undefined | null) {
  // Any unknown status should be treated as blocking to avoid accidental duplicates.
  return !isNonBlockingDedupeStatus(status);
}

function getSpeakerLabel(t: (key: string) => string, speakerCount?: string | number | null) {
  const value = speakerCount == null ? '' : String(speakerCount).trim();
  if (value === 'single' || value === '1') return t('progressModal.overview.single');
  if (value === 'multiple' || value === '2') return t('progressModal.overview.multiple');
  return value || '-';
}

function normalizeSpeakerCountForCreate(speakerCount?: string | number | null) {
  const value = speakerCount == null ? '' : String(speakerCount).trim();
  return value === '2' || value === 'multiple' ? '2' : '1';
}

function getOppositeLanguage(lang: string) {
  return lang === 'zh' ? 'en' : 'zh';
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

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const [videoDetail, setVideoDetail] = useState<VideoDetail | null>(null);
  const [taskList, setTaskList] = useState<TaskMain[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');

  // Add-run (new translation) UI
  const [isAddRunOpen, setIsAddRunOpen] = useState(false);
  const [addRunSourceLanguage, setAddRunSourceLanguage] = useState<string>('zh');
  const [addRunTargetLanguage, setAddRunTargetLanguage] = useState<string>('en');
  const [addRunSpeakerCount, setAddRunSpeakerCount] = useState<string>('1');
  const [addRunSubmitting, setAddRunSubmitting] = useState(false);
  const addRunSubmitLockRef = useRef(false);
  const [addRunPointsPerMinute, setAddRunPointsPerMinute] = useState<number>(3);
  const [addRunConfigLoading, setAddRunConfigLoading] = useState(false);

  // Preview source selection
  const [videoMode, setVideoMode] = useState<'result' | 'preview' | 'original'>('original');
  const prevSelectedTaskIdRef = useRef<string>('');
  const autoPreferredResultModeRef = useRef<Set<string>>(new Set());
  const outputsRefreshedForTaskRef = useRef<Set<string>>(new Set());
  const urlCacheRef = useRef<Map<string, string>>(new Map());
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewProxyUrlRef = useRef<string>('');
  const previewProxyFallbackTriedRef = useRef<Set<string>>(new Set());
  const [previewBuffering, setPreviewBuffering] = useState(false);

  // Preview tools (playback)
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const [previewPlaybackRate, setPreviewPlaybackRate] = useState<number>(1);
  const [previewLoop, setPreviewLoop] = useState(false);

  usePausedVideoPrefetch(previewVideoRef, {
    enabled: Boolean(previewUrl) && !previewLoading,
    minBufferedAheadSeconds: 10,
  });

  // Right panel view (default: deliverables)
  const [rightPanelTab, setRightPanelTab] = useState<'runs' | 'outputs'>('outputs');

  // Progress (inline)
  const progressCardRef = useRef<HTMLDivElement>(null);

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

  const languageOptions = useMemo(() => {
    const isZhUi = locale === 'zh';
    return [
      { value: 'zh', label: isZhUi ? '中文' : 'Chinese' },
      { value: 'en', label: isZhUi ? '英文' : 'English' },
    ] as const;
  }, [locale]);

  const pairKey = useCallback((source: string, target: string) => `${source}__${target}`, []);

  const blockingTaskByPair = useMemo(() => {
    const map = new Map<string, TaskMain>();
    for (const task of taskList) {
      if (!task?.sourceLanguage || !task?.targetLanguage) continue;
      if (!isBlockingDedupeStatus(task.status)) continue;
      const key = pairKey(task.sourceLanguage, task.targetLanguage);
      if (!map.has(key)) map.set(key, task);
    }
    return map;
  }, [pairKey, taskList]);

  const nonBlockingTaskByPair = useMemo(() => {
    const map = new Map<string, TaskMain>();
    for (const task of taskList) {
      if (!task?.sourceLanguage || !task?.targetLanguage) continue;
      if (!isNonBlockingDedupeStatus(task.status)) continue;
      const key = pairKey(task.sourceLanguage, task.targetLanguage);
      if (!map.has(key)) map.set(key, task);
    }
    return map;
  }, [pairKey, taskList]);

  const selectedAddRunBlockingTask = useMemo(() => {
    return blockingTaskByPair.get(pairKey(addRunSourceLanguage, addRunTargetLanguage)) || null;
  }, [addRunSourceLanguage, addRunTargetLanguage, blockingTaskByPair, pairKey]);

  const selectedAddRunNonBlockingTask = useMemo(() => {
    return nonBlockingTaskByPair.get(pairKey(addRunSourceLanguage, addRunTargetLanguage)) || null;
  }, [addRunSourceLanguage, addRunTargetLanguage, nonBlockingTaskByPair, pairKey]);

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

  const stepperCopy = useMemo(
    () => ({
      pending: { label: t('status.pending'), hint: t('ui.statusHint.pending') },
      processing: { label: t('status.processing'), hint: t('ui.statusHint.processing') },
      completed: { label: t('status.completed'), hint: t('ui.statusHint.completed') },
      failed: { label: t('status.failed'), hint: t('ui.statusHint.failed') },
      cancelled: { label: t('status.cancelled'), hint: t('ui.statusHint.failed') },
    }),
    [t]
  );

  const canUseOutputs = selectedTask?.status === 'completed';

  const hasAvailableLanguagePairs = useMemo(() => {
    const values = languageOptions.map((x) => x.value);
    for (const source of values) {
      for (const target of values) {
        if (source === target) continue;
        if (!blockingTaskByPair.has(pairKey(source, target))) return true;
      }
    }
    return false;
  }, [blockingTaskByPair, languageOptions, pairKey]);

  const addRunDurationMinutes = useMemo(() => {
    const seconds = videoDetail?.videoDurationSeconds || 0;
    if (!Number.isFinite(seconds) || seconds <= 0) return 0;
    return Math.max(1, Math.ceil(seconds / 60));
  }, [videoDetail?.videoDurationSeconds]);

  const addRunCreditsEstimate = useMemo(() => {
    if (!addRunDurationMinutes) return 0;
    const ppm = Number.isFinite(addRunPointsPerMinute) && addRunPointsPerMinute > 0 ? addRunPointsPerMinute : 3;
    return addRunDurationMinutes * ppm;
  }, [addRunDurationMinutes, addRunPointsPerMinute]);

  const pickDefaultAddRunPair = useCallback(() => {
    const values = languageOptions.map((x) => x.value);
    for (const source of values) {
      for (const target of values) {
        if (source === target) continue;
        if (!blockingTaskByPair.has(pairKey(source, target))) {
          return { sourceLanguage: source, targetLanguage: target };
        }
      }
    }
    // Fallback: keep deterministic defaults even if all pairs are blocked.
    return { sourceLanguage: values[0] || 'zh', targetLanguage: values[1] || values[0] || 'en' };
  }, [blockingTaskByPair, languageOptions, pairKey]);

  useEffect(() => {
    // Apply playback tool settings to the current <video>. Re-apply on source changes.
    const el = previewVideoRef.current;
    if (!el) return;
    el.playbackRate = previewPlaybackRate;
    el.loop = previewLoop;
  }, [previewLoop, previewPlaybackRate, previewUrl]);

  // Media preconnect + buffering reset (helps on both desktop and mobile networks).
  useEffect(() => {
    setPreviewBuffering(false);
    if (typeof document === 'undefined') return;
    if (!previewUrl) return;
    try {
      const origin = new URL(previewUrl).origin;
      const key = `revoice-preconnect:${origin}`;
      if (!document.head.querySelector(`link[data-revoice-hint="${CSS.escape(key)}"]`)) {
        const pre = document.createElement('link');
        pre.rel = 'preconnect';
        pre.href = origin;
        pre.crossOrigin = 'anonymous';
        pre.dataset.revoiceHint = key;
        document.head.appendChild(pre);

        const dns = document.createElement('link');
        dns.rel = 'dns-prefetch';
        dns.href = origin;
        dns.dataset.revoiceHint = key;
        document.head.appendChild(dns);
      }
    } catch {
      // ignore
    }
  }, [previewUrl]);

  useEffect(() => {
    if (!isAddRunOpen) return;
    let cancelled = false;

    const run = async () => {
      setAddRunConfigLoading(true);
      try {
        // Server source of truth; use the same endpoint as create flow.
        const res = await fetch('/api/video-task/getconfig');
        const data = await res.json();
        const list = (data?.data?.list as Array<{ configKey: string; configValue: string }> | undefined) || [];
        const pointsPerMinuteRaw = list.find((x) => x.configKey === 'credit.points_per_minute')?.configValue;
        const pointsPerMinute = Number.parseInt(pointsPerMinuteRaw || '3', 10);
        if (!cancelled && Number.isFinite(pointsPerMinute) && pointsPerMinute > 0) {
          setAddRunPointsPerMinute(pointsPerMinute);
        }
      } catch (e) {
        console.warn('[ProjectDetailView] Failed to load config for add-run:', e);
      } finally {
        if (!cancelled) setAddRunConfigLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [isAddRunOpen]);

  const originalVideoKey = useMemo(() => {
    if (!videoDetail?.userId || !videoDetail?.id || !videoDetail?.r2Key) return '';
    return getVideoR2PathName(videoDetail.userId, videoDetail.id, videoDetail.r2Key);
  }, [videoDetail?.userId, videoDetail?.id, videoDetail?.r2Key]);

  const originalVideoKey480p = useMemo(() => {
    if (!videoDetail?.userId || !videoDetail?.id) return '';
    return getVideoR2PathName(videoDetail.userId, videoDetail.id, 'original/video/video_original_480p.mp4');
  }, [videoDetail?.userId, videoDetail?.id]);

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

  const taskResultKey480p = useMemo(() => {
    if (!videoDetail?.userId || !selectedTask?.id) return '';
    const r2Key = selectedTask.finalFileList?.find((f) => f.fileType === 'video_480p')?.r2Key;
    if (!r2Key) return '';
    return getVideoR2PathName(videoDetail.userId, selectedTask.id, r2Key);
  }, [videoDetail?.userId, selectedTask?.id, selectedTask?.finalFileList]);

  const [resultVariant, setResultVariant] = useState<'480p' | 'source'>('480p');
  const [originalVariant, setOriginalVariant] = useState<'480p' | 'source'>('480p');

  useEffect(() => {
    setResultVariant('480p');
  }, [selectedTask?.id]);

  useEffect(() => {
    setOriginalVariant('480p');
  }, [videoDetail?.id]);

  const activeVideoKey = useMemo(() => {
    if (videoMode === 'original') {
      return originalVariant === '480p' && originalVideoKey480p ? originalVideoKey480p : originalVideoKey;
    }
    if (videoMode === 'preview') return taskPreviewKey;
    if (resultVariant === '480p' && taskResultKey480p) return taskResultKey480p;
    return taskResultKey;
  }, [
    videoMode,
    originalVariant,
    originalVideoKey,
    originalVideoKey480p,
    taskPreviewKey,
    resultVariant,
    taskResultKey,
    taskResultKey480p,
  ]);

  function toProxySignedMediaUrl(raw: string) {
    const src = (raw || '').trim();
    if (!src) return '';
    if (!/^https?:\/\//i.test(src)) return src;
    try {
      const u = new URL(src);
      // Match server-side allow-list in src/app/api/storage/proxy/route.ts.
      const allow =
        u.protocol === 'https:' &&
        (u.hostname.endsWith('.r2.cloudflarestorage.com') || u.hostname.endsWith('.r2.dev'));
      return allow ? `/api/storage/proxy?src=${encodeURIComponent(src)}` : src;
    } catch {
      return src;
    }
  }

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
  const fetchDetail = useCallback(async ({ silent }: { silent: boolean }) => {
    if (!fileId) return;
    if (!silent) {
      setLoading(true);
      setError('');
    }

    try {
      const response = await fetch(`/api/video-task/detail?fileId=${fileId}`);
      const backJO = await response.json();
      if (backJO?.code !== 0) {
        if (!silent) setError(backJO?.message || '获取视频详情失败');
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
      if (!silent) setError('获取视频详情失败');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [fileId]);

  useEffect(() => {
    void fetchDetail({ silent: false });
  }, [fetchDetail]);

  // Reset per-project refs.
  useEffect(() => {
    prevSelectedTaskIdRef.current = '';
    autoPreferredResultModeRef.current.clear();
    outputsRefreshedForTaskRef.current.clear();
    setRightPanelTab('outputs');
  }, [fileId]);

  // Keep video mode sane when selected task changes, but avoid showing modes that don't exist yet.
  useEffect(() => {
    const id = selectedTask?.id || '';
    const prevId = prevSelectedTaskIdRef.current;
    prevSelectedTaskIdRef.current = id;

    if (!id) {
      setVideoMode('original');
      return;
    }

    // New run selection: default to the best available view.
    if (id !== prevId) {
      setVideoMode(taskResultKey ? 'result' : 'original');
      return;
    }

    // For completed tasks, prefer showing the result once outputs become available.
    if (selectedTask?.status === 'completed' && taskResultKey && !autoPreferredResultModeRef.current.has(id)) {
      autoPreferredResultModeRef.current.add(id);
      setVideoMode('result');
      return;
    }

    // Otherwise, only keep the current mode valid.
    setVideoMode((cur) => {
      if (cur === 'result' && !taskResultKey) return 'original';
      if (cur === 'preview' && !taskPreviewKey) return taskResultKey ? 'result' : 'original';
      return cur;
    });
  }, [selectedTask?.id, selectedTask?.status, taskResultKey, taskPreviewKey]);

  // When a task completes, refresh detail once so final outputs (preview/video) show up without a full reload.
  useEffect(() => {
    const id = selectedTask?.id;
    if (!id) return;
    if (selectedTask.status !== 'completed') return;
    if (taskResultKey) return;
    if (outputsRefreshedForTaskRef.current.has(id)) return;

    outputsRefreshedForTaskRef.current.add(id);
    void fetchDetail({ silent: true });
  }, [fetchDetail, selectedTask?.id, selectedTask?.status, taskResultKey]);

  // Fetch active video URL
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!activeVideoKey) {
        setPreviewUrl('');
        previewProxyUrlRef.current = '';
        return;
      }
      if (activeVideoKey.startsWith('http')) {
        const direct = activeVideoKey;
        setPreviewUrl(direct);
        const proxy = toProxySignedMediaUrl(direct);
        previewProxyUrlRef.current = proxy !== direct ? proxy : '';
        return;
      }

      setPreviewLoading(true);
      try {
        const url = await fetchPrivateUrl(activeVideoKey);
        if (cancelled) return;
        const direct = url;
        setPreviewUrl(direct);
        const proxy = toProxySignedMediaUrl(direct);
        previewProxyUrlRef.current = proxy !== direct ? proxy : '';
      } catch (e) {
        console.error('[ProjectDetailView] Failed to fetch video url:', e);
        if (!cancelled) {
          setPreviewUrl('');
          previewProxyUrlRef.current = '';
        }
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

  const pollSelectedTask = useCallback(async () => {
    if (!selectedTaskId) return false;
    try {
      const response = await fetch(`/api/video-task/getTaskProgress?taskId=${selectedTaskId}`);
      const result = await response.json();
      if (result?.code === 0 && result?.data?.taskItem?.id) {
        updateTaskInList(result.data.taskItem);
        return true;
      }
      return false;
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

    void pollSelectedTask();
    pollingTimerRef.current = setInterval(() => {
      void pollSelectedTask();
    }, 15000);
    return stopPolling;
  }, [pollSelectedTask, selectedTask?.status, selectedTaskId, stopPolling]);

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
    // Ensure the card becomes visible inside the right-column scroll container.
    requestAnimationFrame(() => {
      progressCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [selectedTask?.id]);

  const handleOpenEditor = useCallback(() => {
    if (!selectedTask?.id) return;
    router.push(`/dashboard/projects/video-editor/${selectedTask.id}`);
  }, [router, selectedTask?.id]);

  const openAddRun = useCallback(() => {
    const pair = pickDefaultAddRunPair();
    setAddRunSourceLanguage(pair.sourceLanguage);
    setAddRunTargetLanguage(pair.targetLanguage);
    setAddRunSpeakerCount(normalizeSpeakerCountForCreate(selectedTask?.speakerCount));
    setIsAddRunOpen(true);
  }, [pickDefaultAddRunPair, selectedTask?.speakerCount]);

  const jumpToExistingRun = useCallback((taskId: string) => {
    if (!taskId) return;
    setSelectedTaskId(taskId);
    setIsAddRunOpen(false);
    toast.info(t('ui.addRun.duplicateToast'));
  }, [t]);

  const handleCreateAddRun = useCallback(async () => {
    if (!fileId) return;
    if (!addRunSourceLanguage || !addRunTargetLanguage) return;
    if (addRunSourceLanguage === addRunTargetLanguage) return;
    if (addRunSubmitting || addRunSubmitLockRef.current) return;

    // Client-side guard (UX): if we already have a blocking task, just jump to it.
    if (selectedAddRunBlockingTask?.id) {
      jumpToExistingRun(selectedAddRunBlockingTask.id);
      return;
    }

    addRunSubmitLockRef.current = true;
    setAddRunSubmitting(true);

    try {
      const res = await fetch('/api/video-task/add-run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          originalFileId: fileId,
          sourceLanguage: addRunSourceLanguage,
          targetLanguage: addRunTargetLanguage,
          speakerCount: addRunSpeakerCount,
        }),
      });
      const data = await res.json();

      if (data?.code === 0) {
        const newTaskId = data?.data?.id as string | undefined;
        toast.success(t('ui.addRun.createdToast'));
        setIsAddRunOpen(false);
        if (newTaskId) {
          setSelectedTaskId(newTaskId);
        }
        void fetchDetail({ silent: true });
        return;
      }

      const existingTaskId = data?.data?.existingTaskId as string | undefined;
      if (existingTaskId) {
        jumpToExistingRun(existingTaskId);
        return;
      }

      toast.error(data?.message || t('ui.addRun.failedToast'));
    } catch (e) {
      console.error('[ProjectDetailView] Failed to create add-run:', e);
      toast.error(t('ui.addRun.failedToast'));
    } finally {
      addRunSubmitLockRef.current = false;
      setAddRunSubmitting(false);
    }
  }, [
    addRunSourceLanguage,
    addRunSpeakerCount,
    addRunSubmitting,
    addRunTargetLanguage,
    fetchDetail,
    fileId,
    jumpToExistingRun,
    selectedAddRunBlockingTask?.id,
    t,
  ]);

  if (loading) {
    return (
      <div className="relative mx-auto w-full max-w-7xl flex flex-1 min-h-0 flex-col gap-6">
        {/* Keep the skeleton structure aligned with the real layout to avoid jank. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl">
          <div className="absolute -top-48 left-1/2 h-[420px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-primary/5 to-transparent blur-[90px] opacity-70" />
          <div className="absolute -bottom-56 right-[-18%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-400/10 via-emerald-400/0 to-transparent blur-[80px] opacity-60" />
          <RetroGrid
            className="opacity-30 mix-blend-screen motion-reduce:opacity-0"
            angle={70}
            cellSize={74}
            opacity={0.22}
            lightLineColor="rgba(167, 139, 250, 0.22)"
            darkLineColor="rgba(167, 139, 250, 0.22)"
          />
        </div>

        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-md" />
              <Skeleton className="h-7 w-[320px] max-w-[60vw]" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-56" />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-32" />
            <Skeleton className="h-10 w-10 rounded-md" />
          </div>
        </div>

        {/* Main */}
        <div className="grid flex-1 min-h-0 gap-6 items-stretch lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[minmax(0,1fr)]">
          {/* Preview */}
          <Card className="min-h-0 overflow-hidden flex flex-col gap-0 py-0">
            <CardHeader className="pb-4 pt-5 border-b border-white/5">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-4 w-28" />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <Skeleton className="h-9 w-72 rounded-md" />
                <div className="flex items-center gap-2">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <Skeleton className="h-8 w-16 rounded-full" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="min-h-0 flex-1 flex flex-col gap-4 px-6 pb-6">
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
                <Skeleton className="absolute inset-0" />
              </div>
              <Skeleton className="hidden lg:block h-[72px] w-full rounded-xl" />
            </CardContent>
          </Card>

          {/* Side */}
          <div className="flex h-full flex-col gap-5 min-h-0">
            {/* Progress - Compact */}
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-2 w-full" />
              <Skeleton className="h-2 w-5/6" />
            </div>
          </div>

            {/* Deliverables + Runs (tabbed) */}
            <Card className="min-h-0 flex flex-1 flex-col overflow-hidden border-white/10 bg-white/[0.02] py-0 gap-0">
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/5">
                <div className="flex items-center gap-2 min-w-0">
                  <Skeleton className="h-8 w-44 rounded-md" />
                  <Skeleton className="h-4 w-8" />
                </div>
                <Skeleton className="h-8 w-28 rounded-full" />
              </div>

              <div className="flex-1 min-h-0">
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <Skeleton className="h-[150px] w-full rounded-xl" />
                      <Skeleton className="h-[150px] w-full rounded-xl" />
                    </div>
                    <Skeleton className="h-[110px] w-full rounded-xl" />
                  </div>
                </ScrollArea>
              </div>
            </Card>
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
    <div className="relative mx-auto w-full max-w-7xl flex flex-1 min-h-0 flex-col gap-6">
      {/* Ambient, techy backdrop (subtle; dashboard already has a global glow). */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl">
        <div className="absolute -top-48 left-1/2 h-[420px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-primary/5 to-transparent blur-[90px] opacity-70" />
        <div className="absolute -bottom-56 right-[-18%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-400/10 via-emerald-400/0 to-transparent blur-[80px] opacity-60" />
        <RetroGrid
          className="opacity-30 mix-blend-screen motion-reduce:opacity-0"
          angle={70}
          cellSize={74}
          opacity={0.22}
          lightLineColor="rgba(167, 139, 250, 0.22)"
          darkLineColor="rgba(167, 139, 250, 0.22)"
        />
      </div>

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
              <span className="inline-flex min-w-0 items-center gap-2">
                <Sparkles className="size-4 shrink-0" />
                <span className="min-w-0 truncate">{getLanguageConvertStr(selectedTask, locale)}</span>
                <span
                  className="shrink-0 rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground"
                  title={t('progressModal.overview.speakerCount')}
                >
                  {getSpeakerLabel(t, selectedTask.speakerCount)}
                </span>
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
      <div className="grid flex-1 min-h-0 gap-6 items-stretch lg:grid-cols-[minmax(0,1fr)_400px] lg:grid-rows-[minmax(0,1fr)]">
        {/* Preview */}
        <Card className="min-h-0 overflow-hidden flex flex-col gap-0 py-0">
          <CardHeader className="pb-4 pt-5 border-b border-white/5">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base uppercase tracking-widest text-muted-foreground font-semibold">
                {t('ui.preview')}
              </CardTitle>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
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

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="icon"
                  variant="outline"
                  className={cn(
                    'h-8 w-8 rounded-full border-white/10 bg-white/[0.02] hover:bg-white/[0.04]',
                    previewLoop && 'border-primary/40 bg-primary/10 text-primary'
                  )}
                  onClick={() => setPreviewLoop((v) => !v)}
                  title={t('ui.previewTools.loop')}
                  aria-label={t('ui.previewTools.loop')}
                >
                  <Repeat className="size-4" />
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-8 rounded-full border-white/10 bg-white/[0.02] px-3 font-mono text-xs hover:bg-white/[0.04]"
                      title={t('ui.previewTools.speed')}
                      aria-label={`${t('ui.previewTools.speed')}: ${previewPlaybackRate}x`}
                    >
                      {previewPlaybackRate}x
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-24">
                    {[0.75, 1, 1.25, 1.5].map((rate) => (
                      <DropdownMenuItem
                        key={rate}
                        onClick={() => setPreviewPlaybackRate(rate)}
                        className={cn('font-mono', previewPlaybackRate === rate && 'text-foreground')}
                      >
                        {rate}x
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 flex flex-col gap-4 px-6 pb-6">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
              {previewLoading ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-white/70" />
                </div>
              ) : previewUrl ? (
                <video
                  key={previewUrl}
                  ref={previewVideoRef}
                  src={previewUrl}
                  controls
                  preload="auto"
                  playsInline
                  className="absolute inset-0 h-full w-full object-contain"
                  controlsList="nodownload"
                  onWaiting={() => setPreviewBuffering(true)}
                  onStalled={() => setPreviewBuffering(true)}
                  onPlaying={() => setPreviewBuffering(false)}
                  onCanPlay={() => setPreviewBuffering(false)}
                  onError={() => {
                    setPreviewBuffering(false);

                    // Prefer 480p, but old tasks may not have it yet - fall back to source keys.
                    if (videoMode === 'result' && resultVariant === '480p' && taskResultKey) {
                      setResultVariant('source');
                      return;
                    }
                    if (videoMode === 'original' && originalVariant === '480p' && originalVideoKey) {
                      setOriginalVariant('source');
                      return;
                    }

                    const direct = previewUrl;
                    const proxy = previewProxyUrlRef.current;
                    if (!proxy || proxy === direct) return;
                    if (previewProxyFallbackTriedRef.current.has(direct)) return;
                    previewProxyFallbackTriedRef.current.add(direct);
                    setPreviewUrl(proxy);
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center bg-muted">
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
              {previewUrl && previewBuffering ? (
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10"
                >
                  <Loader2 className="size-8 animate-spin text-white/70" />
                </div>
              ) : null}
            </div>

            {selectedTask ? (
              <div className="hidden lg:block rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="space-y-0.5">
                    <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                      {t('progressModal.overview.startTime')}
                    </div>
                    <div className="truncate text-xs font-semibold text-foreground">
                      {formatDate(selectedTask.startedAt || selectedTask.createdAt || '')}
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                      {t('progressModal.overview.endTime')}
                    </div>
                    <div className="truncate text-xs font-semibold text-foreground">
                      {formatDate(selectedTask.completedAt || '')}
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                      {t('progressModal.overview.creditsConsumed')}
                    </div>
                    <div className="truncate font-mono text-xs font-semibold text-foreground">
                      {typeof selectedTask.creditsConsumed === 'number'
                        ? selectedTask.creditsConsumed
                        : (addRunCreditsEstimate || '-')}
                    </div>
                  </div>

                  <div className="space-y-0.5">
                    <div className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                      {t('progressModal.overview.processDuration')}
                    </div>
                    <div className="truncate font-mono text-xs font-semibold text-foreground">
                      {selectedTask.processDurationSeconds > 0 ? miao2Hms(selectedTask.processDurationSeconds) : '-'}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Side */}
        <div className="flex h-full flex-col gap-5 min-h-0">
          {/* Progress - Compact */}
          <div ref={progressCardRef} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {t('conversion.progress')}
              </span>
              {selectedTask && (
                <span className="text-xs font-medium text-foreground/80">
                  {statusMeta.label}
                </span>
              )}
            </div>
            {selectedTask ? (
              <>
                <TaskStatusStepper
                  status={selectedTask.status}
                  progress={selectedTask.progress}
                  currentStep={selectedTask.currentStep}
                  copy={stepperCopy}
                  hintVariant="inline"
                  showHint={false}
                  showPercent
                />
                {selectedTask.status === 'failed' && selectedTask.errorMessage ? (
                  <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 p-2.5 text-xs text-destructive">
                    {selectedTask.errorMessage}
                  </div>
                ) : null}
              </>
            ) : (
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-2 w-full" />
              </div>
            )}
          </div>

          {/* Deliverables + Runs (tabbed to keep the panel usable on short viewports) */}
          <Card className="min-h-0 flex flex-1 flex-col overflow-hidden border-white/10 bg-white/[0.02] py-0 gap-0">
            <Tabs
              value={rightPanelTab}
              onValueChange={(v) => setRightPanelTab(v as 'runs' | 'outputs')}
              className="min-h-0 flex flex-1 flex-col"
            >
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/5">
                <div className="flex items-center gap-2 min-w-0">
                  <TabsList className="h-8 border-white/10 bg-white/[0.02] p-1">
                    <TabsTrigger value="outputs" className="h-6 px-3 text-xs font-medium uppercase tracking-widest">
                      {t('ui.outputs')}
                    </TabsTrigger>
                    <TabsTrigger value="runs" className="h-6 px-3 text-xs font-medium uppercase tracking-widest">
                      {t('ui.runs')}
                    </TabsTrigger>
                  </TabsList>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={openAddRun}
                  disabled={!hasAvailableLanguagePairs}
                  className={cn(
                    'h-8 gap-2 rounded-full border-white/10 bg-white/[0.02] hover:bg-white/[0.04]',
                    !hasAvailableLanguagePairs && 'opacity-60'
                  )}
                  title={!hasAvailableLanguagePairs ? t('ui.addRun.noAvailable') : undefined}
                >
                  <Languages className="size-4" />
                  {t('ui.addRun.button')}
                </Button>
              </div>

              <TabsContent value="outputs" className="mt-0 flex-1 min-h-0">
                {canUseOutputs ? (
                  <ScrollArea className="h-full">
                    <div className="p-4 space-y-4">
                      {/* Video + Audio Row */}
                      <div className="grid grid-cols-2 gap-3">
                        {/* Video Card */}
                        <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent p-4 transition-colors hover:border-emerald-500/30">
                          <div className="absolute -right-4 -top-4 size-20 rounded-full bg-emerald-500/10 blur-2xl transition-opacity group-hover:opacity-80" />
                          <div className="relative">
                            <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-emerald-500/15">
                              <Film className="size-5 text-emerald-400" />
                            </div>
                            <h4 className="text-sm font-semibold text-foreground">{t('ui.finalVideo.title')}</h4>
                            <p className="mt-1 text-xs text-muted-foreground">{t('ui.finalVideo.description')}</p>
                            <div className="mt-4 flex gap-2">
                              <Button size="sm" className="h-8 flex-1" onClick={handleDownloadVideo}>
                                <Download className="mr-1.5 size-3.5" />
                                {t('buttons.download')}
                              </Button>
                              <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleOpenEditor}>
                                <Pencil className="size-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>

                        {/* Audio Card */}
                        <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-sky-500/10 via-transparent to-transparent p-4 transition-colors hover:border-sky-500/30">
                          <div className="absolute -right-4 -top-4 size-20 rounded-full bg-sky-500/10 blur-2xl transition-opacity group-hover:opacity-80" />
                          <div className="relative">
                            <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-sky-500/15">
                              <Waves className="size-5 text-sky-400" />
                            </div>
                            <h4 className="text-sm font-semibold text-foreground">{t('audio.title')}</h4>
                            <p className="mt-1 text-xs text-muted-foreground">{t('audio.description')}</p>
                            <div className="mt-4 flex gap-2">
                              <Button variant="outline" size="sm" className="h-8 flex-1" onClick={handleOpenAudioPreview}>
                                {t('audio.preview')}
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="icon" className="h-8 w-8">
                                    <Download className="size-3.5" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-40">
                                  <DropdownMenuItem onClick={() => void doDownloadAudio('subtitle')}>
                                    {t('audio.download')}
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => void doDownloadAudio('background')}>
                                    {t('audio.downloadBg')}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Subtitle Card - Full Width */}
                      <div className="group relative overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-violet-500/10 via-transparent to-transparent p-4 transition-colors hover:border-violet-500/30">
                        <div className="absolute -right-6 -top-6 size-24 rounded-full bg-violet-500/10 blur-2xl transition-opacity group-hover:opacity-80" />
                        <div className="relative flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-violet-500/15">
                              <Captions className="size-5 text-violet-400" />
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold text-foreground">{t('subtitle.title')}</h4>
                              <p className="mt-1 text-xs text-muted-foreground">{t('subtitle.description')}</p>
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-2">
                            <Button variant="outline" size="sm" className="h-8" onClick={() => setIsCompareDialogOpen(true)}>
                              {t('subtitle.compare')}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon" className="h-8 w-8">
                                  <Download className="size-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
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
                      </div>
                    </div>
                  </ScrollArea>
                ) : (
                  <ScrollArea className="h-full">
                    <div className="p-4">
                      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-6 text-center">
                        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Sparkles className="size-5" />
                        </div>
                        <div className="text-sm font-semibold text-foreground">{t('ui.outputs')}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {selectedTask
                            ? stepperCopy[selectedTask.status as keyof typeof stepperCopy]?.hint || t('ui.statusHint.pending')
                            : t('ui.emptyRuns')}
                        </div>
                        {selectedTask ? (
                          <div className="mt-4 flex justify-center">
                            <Button variant="outline" size="sm" className="h-8" onClick={handleOpenProgress}>
                              <ListOrdered className="mr-2 size-4" />
                              {t('buttons.progress')}
                            </Button>
                          </div>
                        ) : createHref ? (
                          <div className="mt-4 flex justify-center">
                            <Button asChild size="sm" className="h-8">
                              <Link href={createHref}>{t('ui.startConvert')}</Link>
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </ScrollArea>
                )}
              </TabsContent>

              <TabsContent value="runs" className="mt-0 flex-1 min-h-0">
                <ScrollArea className="h-full">
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <div className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                        {t('ui.runs')}
                      </div>
                      {taskList.length > 0 ? (
                        <span className="rounded-full bg-muted/30 px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                          {taskList.length}
                        </span>
                      ) : null}
                    </div>
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
                      taskList.map((task) => {
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
                                <div className="flex min-w-0 items-center gap-2">
                                  <div className="min-w-0 truncate font-medium text-foreground">
                                    {getLanguageConvertStr(task, locale)}
                                  </div>
                                  <span
                                    className="shrink-0 rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-[11px] text-muted-foreground"
                                    title={t('progressModal.overview.speakerCount')}
                                  >
                                    {getSpeakerLabel(t, task.speakerCount)}
                                  </span>
                                </div>
                              </div>

                              <div className="shrink-0 text-right">
                                <Badge variant="outline" className={cn('justify-end', taskStatusMeta.cls)}>
                                  {taskStatusMeta.label}
                                </Badge>
                                {isRunningStatus(task.status) && (
                                  <div className="mt-2 h-1.5 w-20 overflow-hidden rounded-full bg-muted/40">
                                    <div className="h-full w-full bg-[linear-gradient(90deg,transparent,oklch(0.65_0.22_280_/_0.55),transparent)] [background-size:200%_100%] animate-shimmer motion-reduce:animate-none" />
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
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

      {/* Add-run dialog */}
      <Dialog
        open={isAddRunOpen}
        onOpenChange={(open) => {
          setIsAddRunOpen(open);
          if (!open) return;
          const pair = pickDefaultAddRunPair();
          setAddRunSourceLanguage(pair.sourceLanguage);
          setAddRunTargetLanguage(pair.targetLanguage);
          setAddRunSpeakerCount(normalizeSpeakerCountForCreate(selectedTask?.speakerCount));
        }}
      >
        <DialogContent className="sm:max-w-[560px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Languages className="size-4" />
              </span>
              {t('ui.addRun.title')}
            </DialogTitle>
            <DialogDescription>{t('ui.addRun.description')}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Language pair */}
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">{t('ui.addRun.sourceLanguage')}</div>

                <RadioGroup
                  value={addRunSourceLanguage}
                  onValueChange={(v) => {
                    setAddRunSourceLanguage(v);
                    setAddRunTargetLanguage(getOppositeLanguage(v));
                  }}
                  className="grid grid-cols-2 gap-3"
                >
                  {(['zh', 'en'] as const).map((source) => {
                    const target = getOppositeLanguage(source);
                    const sourceLabel = languageOptions.find((x) => x.value === source)?.label || source;
                    const targetLabel = languageOptions.find((x) => x.value === target)?.label || target;
                    const blockingTask = blockingTaskByPair.get(pairKey(source, target));

                    return (
                      <div key={source} className="relative">
                        <RadioGroupItem
                          value={source}
                          id={`add-run-source-${source}`}
                          className="peer sr-only"
                          disabled={Boolean(blockingTask)}
                        />
                        <Label
                          htmlFor={`add-run-source-${source}`}
                          className={cn(
                            'flex flex-col items-center justify-center rounded-md border-2 border-muted bg-transparent p-3 transition-all select-none peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5',
                            blockingTask
                              ? 'opacity-70 cursor-not-allowed'
                              : 'cursor-pointer hover:bg-accent hover:text-accent-foreground'
                          )}
                          onClick={(e) => {
                            if (!blockingTask) return;
                            e.preventDefault();
                            e.stopPropagation();
                            jumpToExistingRun(blockingTask.id);
                          }}
                        >
                          <Languages className="mb-1 h-5 w-5 text-muted-foreground peer-data-[state=checked]:text-primary" />
                          <span className="font-semibold">
                            {sourceLabel} → {targetLabel}
                          </span>
                          {blockingTask ? (
                            <span className="mt-1 text-[11px] text-muted-foreground">
                              {t('ui.addRun.duplicate')}
                            </span>
                          ) : null}
                        </Label>
                      </div>
                    );
                  })}
                </RadioGroup>

                {selectedAddRunNonBlockingTask?.id ? (
                  <div className="pt-1 text-xs text-muted-foreground">{t('ui.addRun.recreateHint')}</div>
                ) : null}
              </div>
            </div>

            {/* Speaker count */}
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="text-xs font-medium text-muted-foreground">{t('ui.addRun.speakerCount')}</div>
              <RadioGroup
                value={addRunSpeakerCount}
                onValueChange={(v) => setAddRunSpeakerCount(v)}
                className="mt-3 grid grid-cols-2 gap-3"
              >
                {([
                  { value: '1', label: t('progressModal.overview.single') },
                  { value: '2', label: t('progressModal.overview.multiple') },
                ] as const).map((opt) => (
                  <div key={opt.value}>
                    <RadioGroupItem value={opt.value} id={`add-run-spk-${opt.value}`} className="peer sr-only" />
                    <Label
                      htmlFor={`add-run-spk-${opt.value}`}
                      className={cn(
                        'flex flex-col items-center justify-center rounded-md border-2 border-muted bg-transparent p-3 transition-all cursor-pointer hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5'
                      )}
                    >
                      <Users className="mb-1 h-5 w-5 text-muted-foreground peer-data-[state=checked]:text-primary" />
                      <span className="font-semibold">{opt.label}</span>
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* Cost estimate */}
            <div className="rounded-xl border border-primary/15 bg-primary/5 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-medium uppercase tracking-widest text-primary/80">
                    {t('ui.addRun.costTitle')}
                  </div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-primary">{addRunCreditsEstimate}</span>
                    <span className="text-sm text-muted-foreground">{t('menu.credits')}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {addRunDurationMinutes
                      ? t('ui.addRun.costDuration', { minutes: addRunDurationMinutes })
                      : '-'}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t('ui.addRun.costPerMinute', { points: addRunPointsPerMinute })}
                    {addRunConfigLoading ? '…' : ''}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddRunOpen(false)}
              disabled={addRunSubmitting}
            >
              {t('buttons.cancel')}
            </Button>
            <Button
              type="button"
              onClick={handleCreateAddRun}
              disabled={
                addRunSubmitting ||
                !addRunSourceLanguage ||
                !addRunTargetLanguage ||
                addRunSourceLanguage === addRunTargetLanguage ||
                Boolean(selectedAddRunBlockingTask?.id)
              }
            >
              {addRunSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {t('ui.addRun.creating')}
                </>
              ) : (
                <>
                  {t('ui.addRun.create')}
                  <ArrowRight className="ml-2 size-4" />
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
    </div >
  );
}
