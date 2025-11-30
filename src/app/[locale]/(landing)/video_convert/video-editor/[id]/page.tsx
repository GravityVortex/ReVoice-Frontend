"use client";

import React, { useEffect } from 'react';
import VideoEditor from '@/shared/components/video-editor';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/shared/components/ui/breadcrumb';
import { Home } from 'lucide-react';
import Link from "next/link";
import { useParams } from 'next/navigation';

export default function VideoEditorPage() {
  const params = useParams();
  const projectId = params.id as string;
  const locale = (params.locale as string) || "zh";

  const handleExport = (data: any) => {
    console.log('导出数据:', data);
    // 这里可以实现导出逻辑
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background overflow-hidden">
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
                <Link href={`/${locale}/video_convert/project_detail/${projectId}`}>
                  xxxx
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
      <VideoEditor onExport={handleExport} />
    </div>
  );
}
