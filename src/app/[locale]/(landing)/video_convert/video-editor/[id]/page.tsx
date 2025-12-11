"use client";

import React, { useEffect, useState, useRef } from 'react';
import VideoEditor from '@/shared/components/video-editor';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/shared/components/ui/breadcrumb';
import { Home, Loader2 } from 'lucide-react';
import Link from "next/link";
import { useParams } from 'next/navigation';
import { ResizableSplitPanel } from '@/shared/components/resizable-split-panel';
import { AudioListPanel } from '@/shared/components/audio-list-panel';

// 转换对象类型定义
export interface ConvertObj {
  convertId: string;
  type: string;
  video_nosound: string;
  sound_bg: string;
  srt_source: string;
  srt_convert: string;
  srt_source_arr: string[];
  srt_convert_arr: string[];
}

export default function VideoEditorPage() {
  const params = useParams();
  const convertId = params.id as string;
  const locale = (params.locale as string) || "zh";
  const [playingAudioIndex, setPlayingAudioIndex] = useState<number>(-1);
  const [playingSubtitleIndex, setPlayingSubtitleIndex] = useState<number>(-1);
  const [convertObj, setConvertObj] = useState<ConvertObj | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoSource, setVideoSource] = useState<Record<string, any> | null>(null);
  const seekToTimeCallbackRef = useRef<((time: number) => void) | null>(null);

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
          if (result.video_source) {
            setVideoSource(result.video_source);
          }
          if (result.convert_obj) {
            setConvertObj(result.convert_obj);
          }
          console.log('成功加载转换详情:', result.convert_obj);
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <p className="text-lg text-muted-foreground">正在加载转换详情...</p>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error || !convertObj) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="max-w-md p-6 bg-destructive/10 border border-destructive rounded-lg">
          <h2 className="text-xl font-bold text-destructive mb-2">加载失败</h2>
          <p className="text-destructive">{error || '未能获取转换详情'}</p>
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
            <div className="shrink-0 border-b bg-background px-6 py-3">
              <Breadcrumb>
                <BreadcrumbList>
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href={`/${locale}`} className="flex items-center gap-1">
                        <Home className="size-4" />
                        首页
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href={`/${locale}/video_convert/myVideoList`}>
                        视频列表
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink asChild>
                      <Link href={`/${locale}/video_convert/project_detail/${convertId}`}>
                        {videoSource?.title || '视频详情'}
                        {convertObj?.type ? `【${convertObj.type}】` : ''}
                      </Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbPage>{"视频编辑"}</BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
            
            {/* 左侧视频编辑区 */}
            <VideoEditor
              onExport={handleExport}
              convertObj={convertObj}
              onPlayingSubtitleChange={setPlayingSubtitleIndex}
              onSeekToTime={handleRegisterSeekCallback}
            />

            {/* playingAudioIndex >= 0 */}
            {playingAudioIndex >= 0 && (
              <div className="absolute bottom-0 left-0 right-0 h-20 border-t bg-muted/50 px-4 py-2">
                <div className="text-sm text-center font-medium text-primary">
                  正在播放音频列表第 {playingAudioIndex + 1} 项
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
          />
        }
      />
    </div>
  );
}
