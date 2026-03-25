'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ChevronRight,
  CreditCard,
  Download,
  Film,
  Languages,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Users,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Link, useRouter } from '@/core/i18n/navigation';
import { useAppContext } from '@/shared/contexts/app';
import { AudioPlayModal } from '@/shared/blocks/video-convert/Audio-play-modal';
import { CompareSrtModal } from '@/shared/blocks/video-convert/compare-srt-modal';
import { ProjectUpdateModal } from '@/shared/blocks/video-convert/project-update-modal';
import { TaskStatusStepper } from '@/shared/blocks/video-convert/task-status-stepper';
import { RetroGrid } from '@/shared/components/magicui/retro-grid';
import { Badge } from '@/shared/components/ui/badge';
import { ErrorState } from '@/shared/blocks/common/error-state';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { Label } from '@/shared/components/ui/label';
import { LangBadge } from '@/shared/components/ui/lang-badge';
import { RadioGroup, RadioGroupItem } from '@/shared/components/ui/radio-group';
import { ScrollArea } from '@/shared/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { PlyrVideoPlayer } from '@/shared/components/video-player';
import {
  buildResponsiveVideoFrameStyle,
  DEFAULT_VIDEO_ASPECT_RATIO,
  type VideoFrameViewport,
} from '@/shared/components/video-player/video-frame';
import { getDefaultTargetLang, getLangLabel, SUPPORTED_LANGUAGES } from '@/shared/lib/languages';
import { getProjectDetailTaskRowState } from '@/shared/lib/project-detail-task-row';
import { getProjectDetailWorkbenchState } from '@/shared/lib/project-detail-workbench';
import { cn, formatDate, getAudioR2PathName, getPreviewCoverUrl, getVideoR2PathName, miao2Hms } from '@/shared/lib/utils';

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

interface SubtitleItem {
  id: string;
  start: number;
  end: number;
  txt: string;
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

export function ProjectDetailView({ fileId, locale, backHref }: { fileId: string; locale: string; backHref: string }) {
  const router = useRouter();
  const t = useTranslations('video_convert.projectDetail');
  const { user, fetchUserCredits } = useAppContext();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const [videoDetail, setVideoDetail] = useState<VideoDetail | null>(null);
  const [taskList, setTaskList] = useState<TaskMain[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');

  // Add-run (new translation) UI
  const [isAddRunOpen, setIsAddRunOpen] = useState(false);
  const [addRunSourceLanguage, setAddRunSourceLanguage] = useState<string>('en');
  const [addRunTargetLanguage, setAddRunTargetLanguage] = useState<string>('zh');
  const [addRunSpeakerCount, setAddRunSpeakerCount] = useState<string>('1');
  const [addRunSubmitting, setAddRunSubmitting] = useState(false);
  const addRunSubmitLockRef = useRef(false);
  const [addRunPointsPerMinute, setAddRunPointsPerMinute] = useState<number>(3);
  const [addRunConfigLoading, setAddRunConfigLoading] = useState(false);

  // Retranslate UI
  const [isRetranslateOpen, setIsRetranslateOpen] = useState(false);
  const [retranslateSubmitting, setRetranslateSubmitting] = useState(false);
  const retranslateSubmitLockRef = useRef(false);

  // Two-state view: 'list' = task list landing, 'detail' = expanded detail
  const [viewMode, setViewMode] = useState<'list' | 'detail'>('list');

  // Preview source selection
  const [videoMode, setVideoMode] = useState<'result' | 'preview' | 'original'>('original');
  const prevSelectedTaskIdRef = useRef<string>('');
  const autoPreferredResultModeRef = useRef<Set<string>>(new Set());
  const outputsRefreshedForTaskRef = useRef<Set<string>>(new Set());
  const urlCacheRef = useRef<Map<string, string>>(new Map());
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewAspectRatio, setPreviewAspectRatio] = useState<number>(DEFAULT_VIDEO_ASPECT_RATIO);
  const previewSlotRef = useRef<HTMLDivElement>(null);
  const [previewSlotSize, setPreviewSlotSize] = useState<VideoFrameViewport | null>(null);
  const previewProxyUrlRef = useRef<string>('');
  const [previewBuffering, setPreviewBuffering] = useState(false);

  // Preview tools (playback)
  const [previewPlaybackRate, _setPreviewPlaybackRate] = useState<number>(1);
  const [previewLoop, _setPreviewLoop] = useState(false);

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

  // Subtitle overlay state (for result video)
  const [translatedSubtitles, setTranslatedSubtitles] = useState<SubtitleItem[]>([]);
  const [, setSubtitlesLoading] = useState(false);

  const selectedTask = useMemo(() => taskList.find((t) => t.id === selectedTaskId) || null, [taskList, selectedTaskId]);
  const previewFrameStyle = useMemo(
    () => buildResponsiveVideoFrameStyle(previewAspectRatio, previewSlotSize),
    [previewAspectRatio, previewSlotSize]
  );

  useEffect(() => {
    if (viewMode !== 'detail') {
      setPreviewSlotSize(null);
      return;
    }

    const slot = previewSlotRef.current;
    if (!slot || typeof ResizeObserver === 'undefined') return;

    const updatePreviewSlotSize = (width: number, height: number) => {
      if (width <= 0 || height <= 0) return;

      const next = {
        width: Math.round(width),
        height: Math.round(height),
      };

      setPreviewSlotSize((current) => {
        if (current?.width === next.width && current?.height === next.height) return current;
        return next;
      });
    };

    updatePreviewSlotSize(slot.clientWidth, slot.clientHeight);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updatePreviewSlotSize(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(slot);
    return () => observer.disconnect();
  }, [viewMode]);

  const languageOptions = useMemo(() => {
    return SUPPORTED_LANGUAGES.map((l) => ({
      value: l.code,
      label: locale === 'zh' ? l.labelZh : l.labelEn,
    }));
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
    const map: Record<
      string,
      { label: string; badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline'; badgeClassName?: string }
    > = {
      pending: { label: t('status.pending'), badgeVariant: 'outline', badgeClassName: 'text-amber-500 border-amber-500/20 bg-amber-500/5' },
      processing: {
        label: t('status.processing'),
        badgeVariant: 'outline',
        badgeClassName: 'text-orange-500 border-orange-500/20 bg-orange-500/5',
      },
      completed: {
        label: t('status.completed'),
        badgeVariant: 'outline',
        badgeClassName: 'text-green-600 border-green-600/20 bg-green-500/5',
      },
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

  const workbenchState = useMemo(() => getProjectDetailWorkbenchState(selectedTask?.status), [selectedTask?.status]);
  const canUseOutputs = selectedTask?.status === 'completed';
  const shouldStretchDetailColumns = canUseOutputs;

  const uniqueSources = useMemo(() => {
    const sources = new Set(taskList.map((t) => t.sourceLanguage).filter(Boolean));
    return [...sources];
  }, [taskList]);

  const isSingleSourceMode = uniqueSources.length <= 1;

  const getTaskStatusMeta = useCallback(
    (status: string) => {
      const map: Record<string, { label: string; cls: string }> = {
        pending: { label: t('status.pending'), cls: 'text-amber-500 border-amber-500/20 bg-amber-500/5' },
        processing: { label: t('status.processing'), cls: 'text-orange-500 border-orange-500/20 bg-orange-500/5' },
        completed: { label: t('status.completed'), cls: 'text-green-600 border-green-600/20 bg-green-500/5' },
        failed: { label: t('status.failed'), cls: 'text-red-500 border-red-500/20 bg-red-500/5' },
        cancelled: { label: t('status.cancelled'), cls: 'text-muted-foreground' },
      };
      return map[status] || { label: status, cls: '' };
    },
    [t]
  );

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

  const addRunCurrentBalance = user?.credits?.remainingCredits || 0;
  const addRunIsInsufficient = addRunCreditsEstimate > 0 && addRunCurrentBalance < addRunCreditsEstimate;
  const addRunShortBy = Math.max(0, addRunCreditsEstimate - addRunCurrentBalance);

  useEffect(() => {
    if (isAddRunOpen) fetchUserCredits();
  }, [isAddRunOpen, fetchUserCredits]);

  useEffect(() => {
    if (isRetranslateOpen) fetchUserCredits();
  }, [isRetranslateOpen, fetchUserCredits]);

  const summaryStats = useMemo(() => {
    if (!selectedTask) return [];

    return [
      {
        label: t('progressModal.overview.startTime'),
        value: formatDate(selectedTask.startedAt || selectedTask.createdAt || ''),
      },
      {
        label: t('progressModal.overview.endTime'),
        value: formatDate(selectedTask.completedAt || ''),
      },
      {
        label: t('progressModal.overview.creditsConsumed'),
        value:
          typeof selectedTask.creditsConsumed === 'number'
            ? String(selectedTask.creditsConsumed)
            : addRunCreditsEstimate
              ? String(addRunCreditsEstimate)
              : '-',
      },
      {
        label: t('progressModal.overview.processDuration'),
        value:
          selectedTask.processDurationSeconds > 0
            ? miao2Hms(selectedTask.processDurationSeconds)
            : videoDetail?.videoDurationSeconds
              ? miao2Hms(videoDetail.videoDurationSeconds)
              : '-',
      },
    ];
  }, [addRunCreditsEstimate, selectedTask, t, videoDetail?.videoDurationSeconds]);

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
  }, [videoMode, originalVariant, originalVideoKey, originalVideoKey480p, taskPreviewKey, resultVariant, taskResultKey, taskResultKey480p]);

  function toProxySignedMediaUrl(raw: string) {
    const src = (raw || '').trim();
    if (!src) return '';
    if (!/^https?:\/\//i.test(src)) return src;
    try {
      const u = new URL(src);
      // Match server-side allow-list in src/app/api/storage/proxy/route.ts.
      const allow = u.protocol === 'https:' && (u.hostname.endsWith('.r2.cloudflarestorage.com') || u.hostname.endsWith('.r2.dev'));
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

  // Fetch translated subtitles for result video overlay
  const fetchTranslatedSubtitles = useCallback(async (taskId: string) => {
    if (!taskId) return;
    setSubtitlesLoading(true);
    try {
      const response = await fetch(`/api/video-task/getCompareSrtList?taskId=${taskId}`);
      const result = await response.json();
      if (result?.code === 0 && result?.data?.list) {
        // Parse time string format (e.g., "00:00:08,439") to seconds
        const parseTime = (str: string) => {
          if (!str || typeof str !== 'string') return 0;
          const parts = str.split(':');
          if (parts.length !== 3) return 0;
          const [h, m, s] = parts;
          const [sec, ms] = (s || '0').split(/[.,]/);
          const hh = Number.parseInt(h || '0', 10) || 0;
          const mm = Number.parseInt(m || '0', 10) || 0;
          const ss = Number.parseInt(sec || '0', 10) || 0;
          const mss = Number.parseInt(ms || '0', 10) || 0;
          return hh * 3600 + mm * 60 + ss + mss / 1000;
        };

        const subtitles: SubtitleItem[] = result.data.list
          .map((item: any) => ({
            id: item.id,
            start: parseTime(item.start),
            end: parseTime(item.end),
            txt: item.tra_txt || '',
          }))
          .filter((item: SubtitleItem) => item.txt);
        setTranslatedSubtitles(subtitles);
      } else {
        setTranslatedSubtitles([]);
      }
    } catch (e) {
      console.error('[ProjectDetailView] Failed to fetch subtitles:', e);
      setTranslatedSubtitles([]);
    } finally {
      setSubtitlesLoading(false);
    }
  }, []);

  // Fetch detail
  const fetchDetail = useCallback(
    async ({ silent }: { silent: boolean }) => {
      if (!fileId) return;
      if (!silent) {
        setLoading(true);
        setError('');
      }

      try {
        const response = await fetch(`/api/video-task/detail?fileId=${fileId}`);
        const backJO = await response.json();
        if (backJO?.code !== 0) {
          if (!silent) setError(backJO?.message || t('toast.fetchDetailFailed'));
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
        if (!silent) setError(t('toast.fetchDetailFailed'));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [fileId]
  );

  useEffect(() => {
    void fetchDetail({ silent: false });
  }, [fetchDetail]);

  // Reset per-project refs.
  useEffect(() => {
    prevSelectedTaskIdRef.current = '';
    autoPreferredResultModeRef.current.clear();
    outputsRefreshedForTaskRef.current.clear();
    initialViewModeSetRef.current = false;
    setViewMode('list');
  }, [fileId]);

  // Fetch translated subtitles when a completed task is selected
  useEffect(() => {
    if (selectedTask?.status === 'completed' && selectedTask.id) {
      void fetchTranslatedSubtitles(selectedTask.id);
    } else {
      setTranslatedSubtitles([]);
    }
  }, [selectedTask?.id, selectedTask?.status, fetchTranslatedSubtitles]);

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
      setPreviewAspectRatio(DEFAULT_VIDEO_ASPECT_RATIO);
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
        toast.error(data?.message || t('toast.downloadLinkFailed'));
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
      toast.error(t('toast.downloadFailed'));
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
        const response = await fetch(
          `/api/video-task/download-audio?taskId=${selectedTask.id}&key=${encodeURIComponent(key)}&expiresIn=60`
        );
        const data = await response.json();
        if (data?.code !== 0) {
          toast.error(data?.message || t('toast.downloadLinkFailed'));
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
        toast.error(t('toast.downloadFailed'));
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
      toast.error(t('toast.audioFetchFailed'));
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
          toast.error(err?.message || t('toast.subtitleDownloadFailed'));
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
        toast.error(t('toast.subtitleDownloadFailed'));
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
        toast.success(t('toast.deleteSuccess'));
        router.push(backHref);
        return;
      }
      toast.error(result?.message || t('toast.deleteFailed'));
    } catch (e) {
      console.error('[ProjectDetailView] Delete failed:', e);
      toast.error(t('toast.deleteFailedRetry'));
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

  // Auto-expand: if only 1 task, skip list and go to detail directly.
  const initialViewModeSetRef = useRef(false);
  useEffect(() => {
    if (loading || initialViewModeSetRef.current) return;
    if (taskList.length === 1) {
      setSelectedTaskId(taskList[0].id);
      setViewMode('detail');
    }
    initialViewModeSetRef.current = true;
  }, [loading, taskList]);

  const handleSelectTask = useCallback((taskId: string) => {
    setSelectedTaskId(taskId);
    setViewMode('detail');
  }, []);

  const handleBackToList = useCallback(() => {
    setViewMode('list');
  }, []);

  const handleOpenEditor = useCallback(() => {
    if (!selectedTask?.id) return;
    router.push(`/dashboard/projects/video-editor/${selectedTask.id}`);
  }, [router, selectedTask?.id]);

  const focusProgressReview = useCallback(() => {
    progressCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  const openAddRun = useCallback(() => {
    const pair = pickDefaultAddRunPair();
    setAddRunSourceLanguage(pair.sourceLanguage);
    setAddRunTargetLanguage(pair.targetLanguage);
    setAddRunSpeakerCount(normalizeSpeakerCountForCreate(selectedTask?.speakerCount));
    setIsAddRunOpen(true);
  }, [pickDefaultAddRunPair, selectedTask?.speakerCount]);

  const jumpToExistingRun = useCallback(
    (taskId: string) => {
      if (!taskId) return;
      setSelectedTaskId(taskId);
      setIsAddRunOpen(false);
      toast.info(t('ui.addRun.duplicateToast'));
    },
    [t]
  );

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

      const msg = data?.message || t('ui.addRun.failedToast');
      const isCreditsError = msg.includes('积分不足') || msg.toLowerCase().includes('insufficient credit');
      if (isCreditsError) {
        fetchUserCredits();
        toast.error(msg, { action: { label: t('ui.addRun.buyCredits'), onClick: () => window.open('/pricing', '_blank') } });
      } else {
        toast.error(msg);
      }
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
    fetchUserCredits,
    fileId,
    jumpToExistingRun,
    selectedAddRunBlockingTask?.id,
    t,
  ]);

  const handleRetranslate = useCallback(async () => {
    if (!selectedTask?.id) return;
    if (retranslateSubmitting || retranslateSubmitLockRef.current) return;

    retranslateSubmitLockRef.current = true;
    setRetranslateSubmitting(true);

    try {
      const res = await fetch('/api/video-task/retranslate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ existingTaskId: selectedTask.id }),
      });
      const data = await res.json();

      if (data?.code === 0) {
        const newTaskId = data?.data?.id as string | undefined;
        toast.success(t('ui.retranslate.success'));
        setIsRetranslateOpen(false);
        if (newTaskId) {
          setSelectedTaskId(newTaskId);
        }
        void fetchDetail({ silent: true });
        return;
      }

      const msg = data?.message || t('ui.retranslate.failed');
      const isCreditsError = msg.includes('积分不足') || msg.toLowerCase().includes('insufficient credit');
      if (isCreditsError) {
        fetchUserCredits();
        toast.error(msg, { action: { label: t('ui.retranslate.buyCredits'), onClick: () => window.open('/pricing', '_blank') } });
      } else if (data?.data?.existingTaskId) {
        toast.error(t('ui.retranslate.duplicateBlocked'));
      } else {
        toast.error(msg);
      }
    } catch (e) {
      console.error('[ProjectDetailView] Failed to retranslate:', e);
      toast.error(t('ui.retranslate.failed'));
    } finally {
      retranslateSubmitLockRef.current = false;
      setRetranslateSubmitting(false);
    }
  }, [fetchDetail, fetchUserCredits, retranslateSubmitting, selectedTask?.id, t]);

  const openEditProject = useCallback(() => {
    setProjectItem({ ...(videoDetail || {}) });
    setIsEditDialogOpen(true);
  }, [videoDetail]);

  if (loading) {
    return (
      <div className="relative mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-6">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl">
          <div className="absolute -top-48 left-1/2 h-[420px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/[0.03] via-white/[0.01] to-transparent opacity-50 blur-[90px]" />
          <div className="absolute right-[-18%] -bottom-56 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/[0.02] via-transparent to-transparent opacity-40 blur-[80px]" />
          <RetroGrid
            className="opacity-30 mix-blend-screen motion-reduce:opacity-0"
            angle={70}
            cellSize={74}
            opacity={0.22}
            lightLineColor="rgba(255, 255, 255, 0.04)"
            darkLineColor="rgba(255, 255, 255, 0.04)"
          />
        </div>
        {/* Header */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-md" />
          <Skeleton className="h-7 w-[280px] max-w-[50vw]" />
        </div>
        {/* Video info */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4">
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-24 rounded-lg" />
            <div className="flex items-center gap-4">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </div>
        {/* Translations heading */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-8 rounded-full" />
          </div>
          <Skeleton className="h-8 w-28 rounded-full" />
        </div>
        {/* Task cards */}
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
              <div className="flex items-center gap-4">
                {/* Status dot */}
                <Skeleton className="size-2.5 shrink-0 rounded-full" />
                {/* Main content */}
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-6 w-10 rounded" />
                      <Skeleton className="h-4 w-4" />
                      <Skeleton className="h-6 w-10 rounded" />
                    </div>
                    <Skeleton className="h-5 w-48" />
                  </div>
                  <div className="mt-2.5 flex items-center gap-3">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                </div>
                {/* Right side */}
                <div className="flex items-center gap-4">
                  <Skeleton className="h-7 w-16 rounded-full" />
                  <Skeleton className="h-5 w-5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <ErrorState
        detail={error}
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href={backHref}>{t('ui.back')}</Link>
          </Button>
        }
      />
    );
  }

  const sizeMb = ((videoDetail?.fileSizeBytes || 0) / 1024 / 1024).toFixed(2);
  const duration = videoDetail?.videoDurationSeconds ? miao2Hms(videoDetail.videoDurationSeconds) : '-';

  const ambientBackdrop = (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl">
      <div className="absolute -top-48 left-1/2 h-[420px] w-[1100px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/[0.03] via-white/[0.01] to-transparent opacity-50 blur-[90px]" />
      <div className="absolute right-[-18%] -bottom-56 h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/[0.02] via-transparent to-transparent opacity-40 blur-[80px]" />
      <RetroGrid
        className="opacity-30 mix-blend-screen motion-reduce:opacity-0"
        angle={70}
        cellSize={74}
        opacity={0.22}
        lightLineColor="rgba(255, 255, 255, 0.04)"
        darkLineColor="rgba(255, 255, 255, 0.04)"
      />
    </div>
  );

  const moreMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="More">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={openEditProject}>
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
  );

  const renderTaskCard = (task: TaskMain) => {
    const meta = getTaskStatusMeta(task.status);
    const rowState = getProjectDetailTaskRowState(task.status);
    return (
      <button
        key={task.id}
        type="button"
        onClick={() => handleSelectTask(task.id)}
        className="group w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.025] text-left transition-all duration-200 hover:border-white/[0.14] hover:bg-white/[0.04]"
      >
        <div className="flex items-center gap-4 p-3.5">
          {rowState.showThumbnailPreview ? (
            <div className="relative hidden h-16 w-28 shrink-0 overflow-hidden rounded-xl border border-white/8 bg-white/[0.04] sm:block">
              {videoDetail?.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={videoDetail.cover}
                  alt=""
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-white/[0.08] via-white/[0.03] to-transparent">
                  <Film className="text-muted-foreground size-4" />
                </div>
              )}
            </div>
          ) : null}

          <div className="min-w-0 flex-1 py-0.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <LangBadge code={task.sourceLanguage} size="sm" />
                  <ArrowRight className="text-muted-foreground/50 size-4 shrink-0" />
                  <LangBadge code={task.targetLanguage} size="sm" />
                </div>
                <div className="text-foreground mt-2 truncate text-base font-semibold">
                  {getLangLabel(task.sourceLanguage, locale)} → {getLangLabel(task.targetLanguage, locale)}
                </div>
              </div>

              {rowState.showStatusBadge ? (
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-3 py-1.5 text-xs font-medium',
                      task.status === 'completed' && 'bg-emerald-500/10 text-emerald-400',
                      task.status === 'processing' && 'bg-amber-500/10 text-amber-400',
                      task.status === 'pending' && 'bg-zinc-500/10 text-zinc-400',
                      task.status === 'failed' && 'bg-red-500/10 text-red-400',
                      task.status === 'cancelled' && 'bg-zinc-500/10 text-zinc-500'
                    )}
                  >
                    {meta.label}
                  </span>
                  <ChevronRight className="text-muted-foreground/30 group-hover:text-muted-foreground/60 size-5 transition-all group-hover:translate-x-0.5" />
                </div>
              ) : null}
            </div>

            <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Users className="size-3" />
                {getSpeakerLabel(t, task.speakerCount)}
              </span>
              <span className="text-muted-foreground/70 text-xs">
                {task.status === 'completed' ? formatDate(task.completedAt || '') : formatDate(task.startedAt || task.createdAt || '')}
              </span>
              <span className="text-muted-foreground/70 text-xs">
                {task.processDurationSeconds > 0 ? miao2Hms(task.processDurationSeconds) : duration}
              </span>
              {typeof task.creditsConsumed === 'number' && (
                <span className="text-muted-foreground/70 text-xs">{task.creditsConsumed} credits</span>
              )}
              {task.status === 'processing' && task.currentStep && <span className="text-xs text-amber-400/80">{task.currentStep}</span>}
            </div>

            {rowState.showProgress && (
              <div className="mt-3 flex items-center gap-3">
                <div className="h-1.5 max-w-[240px] flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="from-primary/60 to-primary h-full rounded-full bg-gradient-to-r transition-all duration-500"
                    style={{ width: `${Math.max(5, task.progress || 0)}%` }}
                  />
                </div>
                <span className="text-muted-foreground/70 font-mono text-xs">{task.progress || 0}%</span>
              </div>
            )}

            {rowState.showErrorSummary && task.errorMessage ? (
              <div className="text-destructive/85 mt-3 line-clamp-1 text-xs">{task.errorMessage}</div>
            ) : null}
          </div>
        </div>
      </button>
    );
  };

  const statusDotCls = (status: string) => {
    if (status === 'completed') return 'bg-emerald-400';
    if (status === 'processing' || status === 'pending') return 'bg-amber-400';
    if (status === 'failed') return 'bg-red-400';
    return 'bg-zinc-500';
  };

  const compactSwitcher = (
    <div className="flex items-center gap-1.5 overflow-x-auto">
      {(() => {
        const renderItem = (task: TaskMain) => {
          const selected = task.id === selectedTaskId;
          const label = isSingleSourceMode
            ? getLangLabel(task.targetLanguage, locale)
            : `${getLangLabel(task.sourceLanguage, locale)} → ${getLangLabel(task.targetLanguage, locale)}`;
          return (
            <button
              key={task.id}
              type="button"
              onClick={() => handleSelectTask(task.id)}
              className={cn(
                'relative flex shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-all',
                selected
                  ? 'border-primary/40 bg-primary/10 text-foreground'
                  : 'text-muted-foreground hover:text-foreground border-white/8 hover:border-white/20'
              )}
            >
              <LangBadge code={task.targetLanguage} size="sm" />
              <span className="font-medium">{label}</span>
              <span className={cn('size-1.5 shrink-0 rounded-full', statusDotCls(task.status))} />
            </button>
          );
        };

        if (!isSingleSourceMode) {
          const grouped = new Map<string, TaskMain[]>();
          for (const task of taskList) {
            const src = task.sourceLanguage;
            if (!grouped.has(src)) grouped.set(src, []);
            grouped.get(src)!.push(task);
          }
          return [...grouped.entries()].map(([, tasks], gi) => (
            <div key={gi} className="flex items-center gap-1.5">
              {gi > 0 && <div className="mx-1 h-5 w-px shrink-0 bg-white/10" />}
              {tasks.map(renderItem)}
            </div>
          ));
        }
        return taskList.map(renderItem);
      })()}
      <button
        type="button"
        onClick={openAddRun}
        disabled={!hasAvailableLanguagePairs}
        className={cn(
          'flex shrink-0 items-center gap-1.5 rounded-full border border-dashed px-3 py-1.5 text-sm transition-all',
          hasAvailableLanguagePairs ? 'text-muted-foreground hover:border-primary/40 hover:text-primary border-white/15' : 'opacity-40'
        )}
      >
        <Plus className="size-3.5" />
        {t('ui.addLanguage')}
      </button>
    </div>
  );

  if (viewMode === 'list') {
    return (
      <div className="relative mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-6">
        {ambientBackdrop}

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" className="shrink-0" asChild>
              <Link href={backHref} aria-label="Back">
                <ArrowLeft className="size-5" />
              </Link>
            </Button>
            <h1 className="min-w-0 truncate text-2xl font-semibold tracking-tight">{videoDetail?.fileName || 'Project'}</h1>
          </div>
          {moreMenu}
        </div>

        {/* Video info */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              {videoDetail?.cover && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={videoDetail.cover}
                  alt=""
                  className="hidden h-14 w-24 shrink-0 rounded-lg object-cover sm:block"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              )}
              <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="inline-flex items-center gap-1">
                  <Film className="size-4" />
                  {duration}
                </span>
                <span>{sizeMb}MB</span>
                <span>
                  {t('videoInfo.uploadTime')}: {formatDate(videoDetail?.createdAt || '')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Translations heading */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-semibold">{t('ui.translations')}</h2>
            {taskList.length > 0 && (
              <span className="bg-muted/30 text-muted-foreground rounded-full px-2.5 py-0.5 font-mono text-xs">{taskList.length}</span>
            )}
          </div>
          <Button type="button" size="sm" onClick={openAddRun} disabled={!hasAvailableLanguagePairs} className="gap-2">
            <Plus className="size-4" />
            {t('ui.addLanguage')}
          </Button>
        </div>

        {/* Task cards - scrollable area */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {taskList.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-12 text-center">
              <div className="text-muted-foreground mx-auto mb-4 flex size-12 items-center justify-center rounded-xl bg-white/[0.06]">
                <Languages className="size-6" />
              </div>
              <div className="text-foreground text-sm font-semibold">{t('ui.emptyRuns')}</div>
              <div className="text-muted-foreground mt-1 text-xs">{t('ui.statusHint.pending')}</div>
              <div className="mt-5 flex justify-center">
                <Button onClick={openAddRun} disabled={!hasAvailableLanguagePairs} className="gap-2">
                  <Plus className="size-4" />
                  {t('ui.addLanguage')}
                </Button>
              </div>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="space-y-2 pr-4">{taskList.map((task) => renderTaskCard(task))}</div>
            </ScrollArea>
          )}
        </div>

        {/* Modals (list view) */}
        {renderModals()}
      </div>
    );
  }

  return (
    <div className="relative mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-4">
      {ambientBackdrop}

      {/* Header (detail view) */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          {taskList.length > 1 ? (
            <Button variant="ghost" size="sm" className="shrink-0 gap-1.5" onClick={handleBackToList}>
              <ArrowLeft className="size-4" />
              {t('ui.backToList')}
            </Button>
          ) : (
            <Button variant="ghost" size="icon" className="shrink-0" asChild>
              <Link href={backHref} aria-label="Back">
                <ArrowLeft className="size-5" />
              </Link>
            </Button>
          )}
          <h1 className="min-w-0 truncate text-lg font-semibold tracking-tight">{videoDetail?.fileName || 'Project'}</h1>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground gap-1.5" onClick={openEditProject}>
            <Pencil className="size-3.5" />
            {t('menu.editInfo')}
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setShowDeleteDialog(true)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {/* Compact language switcher (or just add-language button for single task) */}
      {taskList.length > 1 ? (
        compactSwitcher
      ) : (
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] px-4 py-2.5">
          {selectedTask && (
            <div className="flex items-center gap-3">
              <LangBadge code={selectedTask.sourceLanguage} size="md" />
              <ArrowRight className="text-muted-foreground size-4" />
              <LangBadge code={selectedTask.targetLanguage} size="md" />
              <span className="text-foreground text-sm font-semibold">
                {getLangLabel(selectedTask.sourceLanguage, locale)} → {getLangLabel(selectedTask.targetLanguage, locale)}
              </span>
              <Badge variant="outline" className={cn('text-xs', statusMeta.badgeClassName)}>
                {statusMeta.label}
              </Badge>
            </div>
          )}
          <Button type="button" size="sm" variant="outline" onClick={openAddRun} disabled={!hasAvailableLanguagePairs} className="gap-2">
            <Plus className="size-4" />
            {t('ui.addLanguage')}
          </Button>
        </div>
      )}

      {/* Main content */}
      <div
        className={cn(
          'grid min-h-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(360px,420px)]',
          shouldStretchDetailColumns ? 'lg:flex-1 lg:items-stretch' : 'lg:items-start'
        )}
      >
        {/* Preview */}
        <Card className={cn('flex flex-col gap-0 overflow-hidden py-0', shouldStretchDetailColumns && 'lg:h-full')}>
          <div className="flex items-center border-b border-white/5 px-3 py-3 md:px-4">
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
          </div>
          <CardContent className={cn('flex flex-1 flex-col p-2 md:p-3', shouldStretchDetailColumns && 'lg:min-h-0')}>
            <div
              ref={previewSlotRef}
              className="aspect-video w-full min-w-0 flex items-center justify-center overflow-hidden"
            >
              <div
                className="relative overflow-hidden rounded-2xl bg-black transition-[width,height,max-width,max-height] duration-300"
                style={previewFrameStyle}
              >
                {previewLoading ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center">
                    <Loader2 className="size-8 animate-spin text-white/70" />
                  </div>
                ) : previewUrl ? (
                  <PlyrVideoPlayer
                    key={previewUrl}
                    src={previewUrl}
                    subtitles={videoMode === 'result' ? translatedSubtitles : []}
                    playbackRate={previewPlaybackRate}
                    loop={previewLoop}
                    onMetadataLoaded={({ aspectRatio }) => setPreviewAspectRatio(aspectRatio)}
                  />
                ) : (
                  <div className="bg-muted absolute inset-0 flex items-center justify-center">
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
                      <div className="text-muted-foreground text-sm">{t('ui.noPreview')}</div>
                    )}
                  </div>
                )}
                {previewUrl && previewBuffering ? (
                  <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/10">
                    <Loader2 className="size-8 animate-spin text-white/70" />
                  </div>
                ) : null}
              </div>
            </div>
            <div className="flex flex-1 flex-col justify-center px-1 md:px-2">
              <div className="rounded-[24px] border border-white/[0.05] bg-gradient-to-b from-white/[0.03] to-transparent px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                <div className="text-muted-foreground text-[11px] font-medium tracking-[0.22em] uppercase">
                  {t('videoInfo.originalVideo')}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2.5">
                  <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-3">
                    <div className="text-muted-foreground text-[10px] font-medium tracking-[0.18em] uppercase">{t('videoInfo.duration')}</div>
                    <div className="text-foreground mt-1 text-sm font-semibold">{duration}</div>
                  </div>
                  <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-3">
                    <div className="text-muted-foreground text-[10px] font-medium tracking-[0.18em] uppercase">{t('videoInfo.size')}</div>
                    <div className="text-foreground mt-1 text-sm font-semibold">{sizeMb} MB</div>
                  </div>
                  <div className="rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-3">
                    <div className="text-muted-foreground text-[10px] font-medium tracking-[0.18em] uppercase">{t('videoInfo.uploadTime')}</div>
                    <div className="text-foreground mt-1 text-sm font-semibold">{formatDate(videoDetail?.createdAt || '')}</div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Side - Action workbench */}
        <div className={cn('flex min-h-0 flex-col gap-4', shouldStretchDetailColumns && 'lg:h-full')}>
          {selectedTask ? (
            <Card className={cn('overflow-hidden border-white/10 bg-white/[0.02] py-0', shouldStretchDetailColumns && 'lg:h-full')}>
              <CardContent className={cn('space-y-5 px-4 py-4', shouldStretchDetailColumns && 'lg:flex lg:h-full lg:flex-col')}>
                <div className="rounded-[24px] border border-white/[0.05] bg-gradient-to-b from-white/[0.045] via-white/[0.028] to-white/[0.015] px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-2.5">
                      <div className="text-muted-foreground text-[11px] font-medium tracking-[0.22em] uppercase">
                        {t('ui.workbench.summary.title')}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <LangBadge code={selectedTask.sourceLanguage} size="md" />
                        <ArrowRight className="text-muted-foreground size-4" />
                        <LangBadge code={selectedTask.targetLanguage} size="md" />
                      </div>
                      <div className="text-foreground text-base font-semibold">
                        {getLangLabel(selectedTask.sourceLanguage, locale)} → {getLangLabel(selectedTask.targetLanguage, locale)}
                      </div>
                    </div>
                    <Badge variant="outline" className={cn('shrink-0 text-xs', statusMeta.badgeClassName)}>
                      {statusMeta.label}
                    </Badge>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2.5">
                    {summaryStats.map((item) => (
                      <div key={item.label} className="rounded-2xl border border-white/[0.06] bg-black/10 px-3 py-3">
                        <div className="text-muted-foreground text-[10px] font-medium tracking-[0.18em] uppercase">{item.label}</div>
                        <div className="text-foreground mt-1 truncate text-sm font-semibold">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {canUseOutputs ? (
                  <div className="space-y-3 rounded-[24px] border border-white/[0.05] bg-gradient-to-b from-white/[0.03] to-transparent px-3 py-3">
                    <div className="flex items-center justify-between gap-4 rounded-[22px] border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                      <div className="min-w-0">
                        <div className="text-foreground text-sm font-semibold">{t('ui.finalVideo.title')}</div>
                        <div className="text-muted-foreground line-clamp-1 text-[11px]">{t('ui.finalVideo.description')}</div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button size="sm" className="h-8 rounded-xl" onClick={handleOpenEditor}>
                          {t('buttons.edit')}
                        </Button>
                        <Button variant="outline" size="sm" className="h-8 rounded-xl" onClick={() => setIsRetranslateOpen(true)}>
                          <RefreshCw className="mr-1.5 size-3.5" />
                          {t('buttons.retranslate')}
                        </Button>
                        <Button variant="outline" size="icon" className="size-8 rounded-xl" onClick={handleDownloadVideo}>
                          <Download className="size-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 rounded-[22px] border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                      <div className="min-w-0">
                        <div className="text-foreground text-sm font-semibold">{t('audio.title')}</div>
                        <div className="text-muted-foreground line-clamp-1 text-[11px]">{t('audio.description')}</div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button variant="outline" size="sm" className="h-8 rounded-xl" onClick={handleOpenAudioPreview}>
                          {t('audio.preview')}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" className="size-8 rounded-xl">
                              <Download className="size-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => void doDownloadAudio('subtitle')}>{t('audio.download')}</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => void doDownloadAudio('background')}>{t('audio.downloadBg')}</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 rounded-[22px] border border-white/[0.06] bg-white/[0.02] px-3 py-3">
                      <div className="min-w-0">
                        <div className="text-foreground text-sm font-semibold">{t('subtitle.title')}</div>
                        <div className="text-muted-foreground line-clamp-1 text-[11px]">{t('subtitle.description')}</div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button variant="outline" size="sm" className="h-8 rounded-xl" onClick={() => setIsCompareDialogOpen(true)}>
                          {t('subtitle.compare')}
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon" className="size-8 rounded-xl">
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
                ) : (
                  <div className="space-y-3 rounded-[24px] border border-white/[0.05] bg-gradient-to-b from-white/[0.03] to-transparent px-3 py-3">
                    {workbenchState.mode !== 'recoverable' ? (
                      <Button className="h-9 w-full rounded-xl" onClick={focusProgressReview}>
                        <Sparkles className="size-4" />
                        {t('ui.workbench.actions.trackProgress')}
                      </Button>
                    ) : null}

                    <div
                      ref={progressCardRef}
                      className={cn(
                        'rounded-[22px] border border-white/[0.06] bg-white/[0.02] p-3.5',
                        workbenchState.showRecoveryActions && 'border-destructive/12 to-destructive/4 bg-linear-to-b from-white/[0.025]'
                      )}
                    >
                      <TaskStatusStepper
                        status={selectedTask.status}
                        progress={selectedTask.progress}
                        currentStep={selectedTask.currentStep}
                        copy={stepperCopy}
                        hintVariant="card"
                        showHint={false}
                        showPercent
                      />

                      {workbenchState.showRecoveryActions ? (
                        <div className="mt-3 border-t border-white/[0.06] pt-3">
                          <div className="text-destructive text-[11px] font-medium tracking-[0.18em] uppercase">
                            {t('ui.workbench.recovery.errorLabel')}
                          </div>
                          <div className="text-muted-foreground mt-1 max-h-24 overflow-y-auto text-xs leading-5 break-all">
                            {selectedTask.errorMessage || t('ui.workbench.summary.errorFallback')}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-white/10 bg-white/[0.02] py-0">
              <CardContent className="flex items-center justify-center p-8">
                <div className="text-center">
                  <div className="text-muted-foreground mx-auto mb-3 flex size-10 items-center justify-center rounded-lg bg-white/[0.06]">
                    <Sparkles className="size-5" />
                  </div>
                  <div className="text-muted-foreground text-sm">{t('ui.statusHint.pending')}</div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {renderModals()}
    </div>
  );

  function renderModals() {
    return (
      <>
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
        <Dialog open={isAddRunOpen} onOpenChange={setIsAddRunOpen}>
          <DialogContent className="sm:max-w-[560px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="bg-primary/10 text-primary inline-flex size-9 items-center justify-center rounded-lg">
                  <Languages className="size-4" />
                </span>
                {t('ui.addRun.title')}
              </DialogTitle>
              <DialogDescription>{t('ui.addRun.description')}</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {/* Language pair */}
              <div className="bg-muted/30 rounded-md border p-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 space-y-1.5">
                      <span className="text-muted-foreground text-xs font-medium">{t('ui.addRun.sourceLanguage')}</span>
                      <Select
                        value={addRunSourceLanguage}
                        onValueChange={(v) => {
                          setAddRunSourceLanguage(v);
                          if (addRunTargetLanguage === v) {
                            setAddRunTargetLanguage(getDefaultTargetLang(v));
                          }
                        }}
                      >
                        <SelectTrigger className="h-12 w-full text-base">
                          <SelectValue placeholder={t('ui.addRun.selectLanguage')} />
                        </SelectTrigger>
                        <SelectContent>
                          {languageOptions.map((lang) => (
                            <SelectItem key={lang.value} value={lang.value} className="py-2.5 text-base">
                              <LangBadge code={lang.value} size="sm" className="mr-2" />
                              <span className="font-medium">{lang.label}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="mt-5 h-10 w-10 shrink-0 rounded-full"
                      title={t('ui.addRun.swap')}
                      onClick={() => {
                        const prev = addRunSourceLanguage;
                        setAddRunSourceLanguage(addRunTargetLanguage);
                        setAddRunTargetLanguage(prev);
                      }}
                    >
                      <ArrowLeftRight className="h-5 w-5" />
                    </Button>

                    <div className="flex-1 space-y-1.5">
                      <span className="text-muted-foreground text-xs font-medium">{t('ui.addRun.targetLanguage')}</span>
                      <Select
                        value={addRunTargetLanguage}
                        onValueChange={(v) => {
                          setAddRunTargetLanguage(v);
                        }}
                      >
                        <SelectTrigger className="h-12 w-full text-base">
                          <SelectValue placeholder={t('ui.addRun.selectLanguage')} />
                        </SelectTrigger>
                        <SelectContent>
                          {languageOptions
                            .filter((l) => l.value !== addRunSourceLanguage)
                            .map((lang) => (
                              <SelectItem key={lang.value} value={lang.value} className="py-2.5 text-base">
                                <LangBadge code={lang.value} size="sm" className="mr-2" />
                                <span className="font-medium">{lang.label}</span>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {selectedAddRunBlockingTask?.id ? (
                    <div className="text-muted-foreground flex items-center gap-2 pt-1 text-xs">
                      <span>{t('ui.addRun.duplicate')}</span>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-xs"
                        onClick={() => jumpToExistingRun(selectedAddRunBlockingTask.id)}
                      >
                        {t('ui.addRun.goToExisting')}
                      </Button>
                    </div>
                  ) : selectedAddRunNonBlockingTask?.id ? (
                    <div className="text-muted-foreground pt-1 text-xs">{t('ui.addRun.recreateHint')}</div>
                  ) : null}
                </div>
              </div>

              {/* Speaker count */}
              <div className="bg-muted/30 rounded-md border p-4">
                <div className="text-muted-foreground text-xs font-medium">{t('ui.addRun.speakerCount')}</div>
                <RadioGroup
                  value={addRunSpeakerCount}
                  onValueChange={(v) => setAddRunSpeakerCount(v)}
                  className="mt-3 grid grid-cols-2 gap-3"
                >
                  {(
                    [
                      { value: '1', label: t('progressModal.overview.single') },
                      { value: '2', label: t('progressModal.overview.multiple') },
                    ] as const
                  ).map((opt) => (
                    <div key={opt.value}>
                      <RadioGroupItem value={opt.value} id={`add-run-spk-${opt.value}`} className="peer sr-only" />
                      <Label
                        htmlFor={`add-run-spk-${opt.value}`}
                        className={cn(
                          'border-muted hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 flex cursor-pointer flex-col items-center justify-center rounded-md border-2 bg-transparent p-3 transition-all'
                        )}
                      >
                        <Users className="text-muted-foreground peer-data-[state=checked]:text-primary mb-1 h-5 w-5" />
                        <span className="font-semibold">{opt.label}</span>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              {/* Cost estimate */}
              <div className={cn(
                "rounded-xl border p-4 transition-colors",
                addRunIsInsufficient ? "border-destructive/20 bg-destructive/5" : "border-primary/15 bg-primary/5"
              )}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-primary/80 text-xs font-medium tracking-widest uppercase">{t('ui.addRun.costTitle')}</div>
                    <div className="mt-2 flex items-baseline gap-2">
                      <span className="text-primary text-3xl font-bold">{addRunCreditsEstimate}</span>
                      <span className="text-muted-foreground text-sm">{t('menu.credits')}</span>
                    </div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      {addRunDurationMinutes ? t('ui.addRun.costDuration', { minutes: addRunDurationMinutes }) : '-'}
                    </div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      {t('ui.addRun.costPerMinute', { points: addRunPointsPerMinute })}
                      {addRunConfigLoading ? '…' : ''}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-medium text-muted-foreground">{t('ui.addRun.currentBalance')}</div>
                    <div className={cn("mt-1 text-2xl font-bold", addRunIsInsufficient ? "text-destructive" : "text-primary")}>
                      {addRunCurrentBalance}
                    </div>
                  </div>
                </div>
                {addRunIsInsufficient && (
                  <div className="mt-3 rounded-lg bg-destructive/10 border border-destructive/20 p-3 space-y-2">
                    <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                      <AlertTriangle className="size-4 shrink-0" />
                      {t('ui.addRun.insufficientCredits', { amount: addRunShortBy })}
                    </p>
                    <Button
                      variant="default"
                      size="sm"
                      className="w-full"
                      onClick={() => window.open('/pricing', '_blank')}
                    >
                      <CreditCard className="mr-2 size-4" />
                      {t('ui.addRun.buyCredits')}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddRunOpen(false)} disabled={addRunSubmitting}>
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
                  Boolean(selectedAddRunBlockingTask?.id) ||
                  addRunIsInsufficient
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

        {/* Retranslate confirmation */}
        <Dialog open={isRetranslateOpen} onOpenChange={setIsRetranslateOpen}>
          <DialogContent className="sm:max-w-[480px]">
            <DialogHeader>
              <DialogTitle>{t('ui.retranslate.title')}</DialogTitle>
              <DialogDescription>{t('ui.retranslate.description')}</DialogDescription>
            </DialogHeader>

            <div className={cn(
              "rounded-xl border p-4 transition-colors",
              addRunIsInsufficient ? "border-destructive/20 bg-destructive/5" : "border-primary/15 bg-primary/5"
            )}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-primary/80 text-xs font-medium tracking-widest uppercase">{t('ui.retranslate.costTitle')}</div>
                  <div className="mt-2 flex items-baseline gap-2">
                    <span className="text-primary text-3xl font-bold">{addRunCreditsEstimate}</span>
                    <span className="text-muted-foreground text-sm">{t('menu.credits')}</span>
                  </div>
                  <div className="text-muted-foreground mt-1 text-xs">
                    {addRunDurationMinutes ? t('ui.retranslate.costDuration', { minutes: addRunDurationMinutes }) : '-'}
                  </div>
                  <div className="text-muted-foreground mt-1 text-xs">
                    {t('ui.retranslate.costPerMinute', { points: addRunPointsPerMinute })}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-medium text-muted-foreground">{t('ui.retranslate.currentBalance')}</div>
                  <div className={cn("mt-1 text-2xl font-bold", addRunIsInsufficient ? "text-destructive" : "text-primary")}>
                    {addRunCurrentBalance}
                  </div>
                </div>
              </div>
              {addRunIsInsufficient && (
                <div className="mt-3 rounded-lg bg-destructive/10 border border-destructive/20 p-3 space-y-2">
                  <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                    <AlertTriangle className="size-4 shrink-0" />
                    {t('ui.retranslate.insufficientCredits', { amount: addRunShortBy })}
                  </p>
                  <Button
                    variant="default"
                    size="sm"
                    className="w-full"
                    onClick={() => window.open('/pricing', '_blank')}
                  >
                    <CreditCard className="mr-2 size-4" />
                    {t('ui.retranslate.buyCredits')}
                  </Button>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsRetranslateOpen(false)} disabled={retranslateSubmitting}>
                {t('ui.retranslate.cancel')}
              </Button>
              <Button
                type="button"
                onClick={handleRetranslate}
                disabled={retranslateSubmitting || addRunIsInsufficient}
              >
                {retranslateSubmitting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    {t('ui.retranslate.confirming')}
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 size-4" />
                    {t('ui.retranslate.confirm')}
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
      </>
    );
  }
}
