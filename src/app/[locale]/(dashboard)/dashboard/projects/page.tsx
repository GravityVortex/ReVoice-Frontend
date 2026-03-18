'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { Languages, PlusCircle, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { useRouter } from '@/core/i18n/navigation';
import { ConversionProgressModal } from '@/shared/blocks/video-convert/convert-progress-modal';
import { ProjectUpdateModal } from '@/shared/blocks/video-convert/project-update-modal';
import { Button } from '@/shared/components/ui/button';
import { Pagination } from '@/shared/components/ui/pagination-client';
import { Skeleton } from '@/shared/components/ui/skeleton';
import VideoList, { VideoListItem } from '@/shared/components/ui/video-list';
import VideoPlayerModal from '@/shared/components/ui/video-player-modal';
import { useAppContext } from '@/shared/contexts/app';
import { cn, getPreviewCoverUrl, getVideoR2PathName } from '@/shared/lib/utils';

export default function DashboardProjectsPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const locale = (params?.locale as string) || 'zh';
  const router = useRouter();
  const { user } = useAppContext();
  const t = useTranslations('video_convert.myVideoList');
  const tDashboard = useTranslations('common.dashboard.sidebar');

  const [selectedVideo, setSelectedVideo] = useState<VideoListItem | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [selectedVideoUrlCandidates, setSelectedVideoUrlCandidates] = useState<string[]>([]);
  const [videoList, setVideoList] = useState<VideoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize] = useState(6);
  const [isProgressDialogOpen, setIsProgressDialogOpen] = useState(false);
  const [taskMainId, setTaskMainId] = useState<string>('');
  const [activeTabIdx, setActiveTabIdx] = useState<string>('1');
  const [projectItem, setProjectItem] = useState<Record<string, any>>({});
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [, setPreUrl] = useState<string>('');

  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (searchParams.get('open') === 'create') {
      router.replace('/dashboard/create');
    }
  }, [searchParams, router]);

  const handlePlayVideo = (item: VideoListItem) => {
    const len = item.tasks?.length || 0;
    if (item.status === 'completed' && len > 0) {
      const task: any = item.tasks?.[len - 1];
      const taskId = task?.id || '';
      const userId = user?.id || '';
      const finalFiles: any[] = task?.finalFileList || [];
      const r2Key480p = finalFiles.find((f) => f.fileType === 'video_480p')?.r2Key as string | undefined;
      const r2KeySource =
        (finalFiles.find((f) => f.fileType === 'video')?.r2Key as string | undefined) || 'merge_audio_video/video/video_new.mp4';
      const primaryKey = r2Key480p || r2KeySource;
      const primary = getVideoR2PathName(userId, taskId, primaryKey);
      const fallback = getVideoR2PathName(userId, taskId, r2KeySource);
      setSelectedVideoUrlCandidates(primary === fallback ? [primary] : [primary, fallback]);
      item.videoUrl = primary;
    }
    setSelectedVideo(item);
    setIsPlayerOpen(true);
  };

  const handleItemClick = (item: VideoListItem) => {
    router.push(`/dashboard/projects/${item.id}`);
  };

  const onStatusClick = (item: VideoListItem) => {
    const hasRunning = item.tasks?.some(
      (task: any) => task.status === 'processing' || task.status === 'pending'
    );

    if (!hasRunning) {
      router.push(`/dashboard/projects/${item.id}`);
      return;
    }

    setActiveTabIdx('1');
    let tempId;
    if (item.tasks && item.tasks.length > 0) {
      if (item.tasks.length === 1) {
        tempId = item.tasks[0].id;
      } else {
        const theIt = item.tasks.find((task: any) => task.status === 'processing');
        tempId = theIt ? theIt.id : item.tasks[0].id;
      }
    }
    if (tempId) {
      setTaskMainId(tempId);
      setIsProgressDialogOpen(true);
    }
  };

  const goAddClick = () => {
    router.push('/dashboard/create');
  };

  const handleClosePlayer = () => {
    setIsPlayerOpen(false);
    setSelectedVideo(null);
    setSelectedVideoUrlCandidates([]);
  };

  const onItemUpdateEvent = (changeItem: Record<string, any>) => {
    setVideoList((prevList) => prevList.map((item) => (item.id === changeItem.id ? { ...item, ...changeItem } : item)));
  };

  const doGetVideoListFromNet = useCallback(async (page: number = currentPage) => {
    try {
      setLoading(true);
      setError('');
      const user_id = user?.id || '';
      const url = `/api/video-task/list?userId=${user_id}&page=${page}&limit=${pageSize}`;

      const response = await fetch(url, { method: 'GET' });
      const data = await response.json();

      if (data?.code === 0) {
        const responseData = data.data;
        setPreUrl(responseData.preUrl || '');
        const convertedList: VideoListItem[] = (responseData.list || []).map((item: any) => {
          let status = 'pending';
          if (item.tasks && item.tasks.length > 0) {
            if (item.tasks.length === 1) {
              status = item.tasks[0].status;
            } else {
              const hasProcessing = item.tasks.some((task: any) => task.status === 'processing');
              status = hasProcessing ? 'processing' : item.tasks[0].status;
            }
          }

          const seconds = item.videoDurationSeconds || 0;
          const h = Math.floor(seconds / 3600);
          const m = Math.floor((seconds % 3600) / 60);
          const s = seconds % 60;
          const duration = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

          return {
            ...item,
            fileName: item.fileName || 'Untitled',
            cover: getPreviewCoverUrl(item, responseData.preUrl),
            videoUrl: item.r2Key ? getVideoR2PathName(item.userId, item.id, item.r2Key) : '',
            status,
            duration,
            convertedAt: new Date(item.createdAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US'),
            videoSize: item.fileSizeBytes || 0,
            tasks: item.tasks,
          };
        });
        setVideoList(convertedList);

        if (responseData.pagination) {
          setCurrentPage(responseData.pagination.page);
          setTotalPages(responseData.pagination.totalPages);
          setTotalCount(responseData.pagination.totalCount);
        }
      } else {
        setError(data?.message || t('error'));
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError(t('error'));
    } finally {
      setLoading(false);
    }
  }, [currentPage, locale, pageSize, t, user?.id]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      setCurrentPage(page);
      doGetVideoListFromNet(page);
    }
  };

  useEffect(() => {
    doGetVideoListFromNet();
  }, []);

  // Poll when there are processing items
  useEffect(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    const hasProcessing = videoList.some(
      (item) => item.status === 'processing' || item.status === 'pending'
    );

    if (hasProcessing && !loading) {
      pollTimerRef.current = setInterval(() => {
        doGetVideoListFromNet(currentPage);
      }, 12000);
    }

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [videoList, loading, currentPage, doGetVideoListFromNet]);

  // Page summary stats
  const processingCount = useMemo(() => {
    return videoList.filter((item) =>
      item.tasks?.some((task: any) => task.status === 'processing' || task.status === 'pending')
    ).length;
  }, [videoList]);

  const pageSummary = useMemo(() => {
    if (loading || videoList.length === 0) return '';
    const parts: string[] = [];
    parts.push(`${totalCount} ${t('pageSummary.videos')}`);
    if (processingCount > 0) {
      parts.push(`${processingCount} ${t('pageSummary.translating')}`);
    }
    return parts.join(' · ');
  }, [loading, videoList.length, totalCount, processingCount, t]);

  return (
    <div className="container mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">{tDashboard('projects')}</h1>
            {pageSummary && (
              <p className="mt-1 text-sm text-muted-foreground">{pageSummary}</p>
            )}
          </div>
          <Button
            onClick={goAddClick}
            size="lg"
            className={cn(
              'rounded-full px-6 transition-all duration-300',
              'bg-primary hover:bg-primary/90 text-primary-foreground',
              'shadow-[0_4px_14px_0_rgba(0,0,0,0.1)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.23)]',
              'hover:scale-105 active:scale-95',
              'border border-white/10'
            )}
          >
            <PlusCircle className="mr-2 h-5 w-5" />
            {t('buttons.upload')}
          </Button>
        </div>
      </div>

      {loading && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="bg-card border-border/50 flex flex-col gap-3 rounded-2xl border p-3 shadow-sm">
              <div className="relative aspect-video w-full overflow-hidden rounded-xl">
                <Skeleton className="absolute inset-0 rounded-xl" />
                <Skeleton className="absolute right-2 bottom-2 h-4 w-10 rounded" />
              </div>
              <div className="flex flex-col gap-1 px-1">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="mt-1 h-4 w-1/2" />
                <Skeleton className="mt-1 h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && !loading && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 bg-muted/20 py-20 text-center">
          <p className="text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => doGetVideoListFromNet()}>
            {locale === 'zh' ? '重试' : 'Retry'}
          </Button>
        </div>
      )}

      {!loading && !error && (
        <>
          <VideoList
            items={videoList}
            cols={3}
            locale={locale}
            onItemClick={handleItemClick}
            onVideoPlay={handlePlayVideo}
            onStatusClick={onStatusClick}
          />

          {videoList.length > 0 && totalPages > 1 && (
            <div className="mt-8 flex justify-end">
              <Pagination currentPage={currentPage} totalPages={totalPages} totalCount={totalCount} onPageChange={handlePageChange} />
            </div>
          )}

          {videoList.length === 0 && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 bg-muted/10 py-24 text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10">
                <Languages className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-foreground">
                {t('emptyState.title')}
              </h2>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                {t('emptyState.subtitle')}
              </p>
              <Button onClick={goAddClick} size="lg" className="mt-6 gap-2 rounded-full px-8">
                <Sparkles className="h-5 w-5" />
                {t('emptyState.cta')}
              </Button>
            </div>
          )}
        </>
      )}

      {selectedVideo && (
        <VideoPlayerModal
          isOpen={isPlayerOpen}
          onClose={handleClosePlayer}
          videoUrl={selectedVideo.videoUrl}
          videoUrlCandidates={selectedVideoUrlCandidates}
          title={selectedVideo.fileName}
        />
      )}

      <ConversionProgressModal
        isOpen={isProgressDialogOpen}
        onClose={() => setIsProgressDialogOpen(false)}
        taskMainId={taskMainId}
        activeTabIdx={activeTabIdx}
      />

      <ProjectUpdateModal
        projectItem={projectItem}
        isOpen={isEditDialogOpen}
        onUpdateEvent={onItemUpdateEvent}
        onClose={() => setIsEditDialogOpen(false)}
      />
    </div>
  );
}
