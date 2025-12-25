"use client";

import React, { useEffect, useState, useRef } from 'react';
import { ConvertObj } from '@/shared/components/video-editor';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/shared/components/ui/breadcrumb';
import { Home, Loader2 } from 'lucide-react';
import Link from "next/link";
import { Skeleton } from '@/shared/components/ui/skeleton';
import { useParams } from 'next/navigation';
import { ResizableSplitPanel } from '@/shared/components/resizable-split-panel';
import { AudioListPanel } from '@/app/[locale]/(landing)/video_convert/video-editor/[id]/panel-audio-list';
import { getLanguageConvertStr } from '@/shared/lib/utils';
import PanelVideoEditor from './panel-video-editor';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { useTranslations } from 'next-intl';


export default function VideoEditorPage() {
  const params = useParams();
  const convertId = params.id as string;
  // console.log('params--->', params)
  const locale = (params.locale as string) || "zh";
  const t = useTranslations('video_convert.videoEditor');
  const [playingAudioIndex, setPlayingAudioIndex] = useState<number>(-1);
  const [playingSubtitleIndex, setPlayingSubtitleIndex] = useState<number>(-1);
  const [convertObj, setConvertObj] = useState<ConvertObj | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoSource, setVideoSource] = useState<Record<string, any> | null>(null);
  const seekToTimeCallbackRef = useRef<((time: number) => void) | null>(null);
  const updateAudioUrlCallbackRef = useRef<((id: string, audioUrl: string) => void) | null>(null);
  // const [r2PreUrl, setR2PreUrl] = useState<string>('');
  // 删除确认弹框
  const [showTipDialog, setShowTipDialog] = useState(false);

  // 获取转换详情
  useEffect(() => {
    const fetchConvertDetail = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/video-task/editVideoAudiosubtitleDetail?taskMainId=${convertId}`);

        if (!response.ok) {
          throw new Error('获取转换详情失败');
        }

        const result = await response.json();

        if (result.code === '0') {

          if (result.videoItem) {
            setVideoSource(result.videoItem);
            // setR2PreUrl(result.publicBaseUrl);
          }
          if (result.taskMainItem) {
            setConvertObj({
              ...result.taskMainItem,
              r2preUrl: result.publicBaseUrl,
              env: result.env
            });
          }
          console.log('成功加载转换详情:', result.taskMainItem);
        } else {
          throw new Error(result.msg || '数据格式错误');
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : '加载失败';
        setError(errorMessage);
        console.error('获取转换详情失败:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (convertId) {
      fetchConvertDetail();
    }
  }, [convertId]);

  const handleExport = (data: any) => {
    console.log('导出数据:', data);
    // 这里可以实现导出逻辑
  };

  // 注册左侧视频编辑器的定位回调
  const handleRegisterSeekCallback = (callback: (time: number) => void) => {
    seekToTimeCallbackRef.current = callback;
  };

  // 右侧面板请求定位时调用
  const handleSeekToSubtitle = (time: number) => {
    if (seekToTimeCallbackRef.current) {
      seekToTimeCallbackRef.current(time);
    }
  };

  // 注册更新字幕音频URL回调
  const handleRegisterUpdateAudioUrl = (callback: (id: string, audioUrl: string) => void) => {
    updateAudioUrlCallbackRef.current = callback;
  };

  // 右侧面板更新字幕音频URL时调用
  const handleUpdateSubtitleAudioUrl = (id: string, audioUrl: string) => {
    if (updateAudioUrlCallbackRef.current) {
      updateAudioUrlCallbackRef.current(id, audioUrl);
    }
  };
  // 提示
  const handleBtnClick = async (type: string) => {
    if (type === 'stopTip') {
      localStorage.setItem('showTip', 'false');
    }
    setShowTipDialog(false);
  }

  const handleShowTip = () => {
    const showTip = localStorage.getItem('showTip');
    if (showTip !== 'false') {
      setShowTipDialog(true);
    }
  }

  // 防止父页面滚动
  useEffect(() => {
    // 隐藏 body 滚动条
    document.body.style.overflow = 'hidden';

    return () => {
      // 组件卸载时恢复滚动
      document.body.style.overflow = '';
    };
  }, []);

  // 加载中状态
  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex bg-background">
        <div className="flex-1 flex flex-col p-4 gap-4">
          {/* 面包屑骨架 */}
          <Skeleton className="h-10 w-full" />
          {/* 视频预览骨架 */}
          <Skeleton className="flex-1 w-full" />
          {/* 控制栏骨架 */}
          <Skeleton className="h-16 w-full" />
          {/* 时间轴骨架 */}
          <Skeleton className="h-64 w-full" />
        </div>
        <div className="w-96 border-l flex flex-col p-4 gap-3">
          {/* 右侧标题骨架 */}
          <Skeleton className="h-12 w-full" />
          {/* 字幕列表骨架 */}
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      </div>
    );
  }

  // 错误状态
  if (error || !convertObj) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="max-w-md p-6 bg-destructive/10 border border-destructive rounded-lg">
          <h2 className="text-xl font-bold text-destructive mb-2">{t('error.loadFailed')}</h2>
          <p className="text-destructive">{error || t('error.noData')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background overflow-hidden">


      {/* 可调整大小的分隔面板 */}
      <ResizableSplitPanel
        minLeftWidthPercent={33.33}
        defaultLeftWidthPercent={60}
        leftPanel={
          <div className="h-full flex flex-col relative">
            {/* 面包屑导航 */}
            <div className="shrink-0 border-b bg-card px-6 py-3">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href={`/${locale}`} className="flex items-center gap-1">
                        <Home className="size-4" />
                        {t('breadcrumb.home')}
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href={`/${locale}/video_convert/myVideoList`}>
                        {t('breadcrumb.videoList')}
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href={`/${locale}/video_convert/project_detail/${videoSource?.id}`}>
                        {videoSource?.fileName || '视频详情'}
                        {`【${getLanguageConvertStr(convertObj, locale)}】`}
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{t('breadcrumb.videoEditor')}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>

            {/* 左侧视频编辑区 */}
            <PanelVideoEditor
              onExport={handleExport}
              convertObj={convertObj}
              onPlayingSubtitleChange={setPlayingSubtitleIndex}
              onSeekToTime={handleRegisterSeekCallback}
              onRegisterUpdateAudioUrl={handleRegisterUpdateAudioUrl}
            />

            {/* playingAudioIndex >= 0 */}
            {playingAudioIndex >= 0 && (
              <div className="absolute bottom-0 left-0 right-0 h-20 border-t bg-muted/50 px-4 py-2">
                <div className="text-sm text-center font-medium text-primary">
                  {t('playingAudio', { index: playingAudioIndex + 1 })}
                </div>
              </div>
            )}
          </div>
        }
        rightPanel={
          <AudioListPanel
            onPlayingIndexChange={setPlayingAudioIndex}
            convertObj={convertObj}
            playingSubtitleIndex={playingSubtitleIndex}
            onSeekToSubtitle={handleSeekToSubtitle}
            onShowTip={handleShowTip}
            onUpdateSubtitleAudioUrl={handleUpdateSubtitleAudioUrl}
          />
        }
      />

      {/* 提示弹框 */}
      <Dialog open={showTipDialog} onOpenChange={setShowTipDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>提示</DialogTitle>
            <DialogDescription>所有局部字幕音频保存成功后需点击屏幕右上角“保存”按钮进行视频重新合成，局部修改才能生效。</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => handleBtnClick('stopTip')}>不在提示</Button>
            <Button variant="destructive" onClick={() => handleBtnClick('know')}>知道了</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
