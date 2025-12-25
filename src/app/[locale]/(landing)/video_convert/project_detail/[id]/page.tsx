'use client';

import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  BadgeDollarSign,
  BookmarkX,
  ChevronDown,
  CircleEllipsis,
  Coins,
  Download,
  Edit,
  Edit2,
  Home,
  ListOrdered,
  ListOrderedIcon,
  Loader2,
  Play,
  Plus,
  Settings,
  Share2,
  Trash2,
  Video,
} from 'lucide-react';
import { motion, Variants } from 'motion/react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { envConfigs } from '@/config';
import { user } from '@/config/db/schema';
import { LocaleSelector, SignUser } from '@/shared/blocks/common';
import { ThemeToggler } from '@/shared/blocks/common/theme-toggler';
import { AudioPlayModal } from '@/shared/blocks/video-convert/Audio-play-modal';
import { CompareSrtModal } from '@/shared/blocks/video-convert/compare-srt-modal';
import { ConvertAddModal } from '@/shared/blocks/video-convert/convert-add-modal';
import { ConversionProgressModal } from '@/shared/blocks/video-convert/convert-progress-modal';
import { ProjectUpdateModal } from '@/shared/blocks/video-convert/project-update-modal';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shared/components/ui/breadcrumb';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/shared/components/ui/collapsible';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import VideoPlayerModal from '@/shared/components/ui/video-player-modal';
import { cn, formatDate, getAudioR2PathName, getPreviewCoverUrl, getVideoR2PathName, miao2Hms } from '@/shared/lib/utils';

import { LeftMenuPanel } from './LeftMenuPanel';
import { RightContentPanel } from './RightContentPanel';

//         "videoItem": {
//             "id": "8bb54f6e-8572-44f5-a674-ae939b026c63",
//             "userId": "99a30c57-88c1-4c93-9a4d-cea945a731be",
//             "fileName": "test3.mp4",
//             "fileSizeBytes": 2419199,
//             "fileType": "video/mp4",
//             "r2Key": "uploads/1765106611963-test3.mp4",
//             "r2Bucket": "video-store",
//             "videoDurationSeconds": 65,
//             "checksumSha256": "",
//             "uploadStatus": "pending",
//             "coverR2Key": null,
//             "coverSizeBytes": null,
//             "coverUpdatedAt": null,
//             "createdBy": "99a30c57-88c1-4c93-9a4d-cea945a731be",
//             "createdAt": "2025-12-07T11:24:05.135Z",
//             "updatedBy": "99a30c57-88c1-4c93-9a4d-cea945a731be",
//             "updatedAt": "2025-12-07T11:24:05.135Z",
//             "delStatus": 0
//         },

// 视频详情数据类型
interface VideoDetail {
  id: string;
  uuid: string;
  userId: string;
  fileName: string;
  fileSizeBytes: number;
  fileType: string;

  videoDurationSeconds: number;
  // description: string;
  // content: string;
  createdAt: string;
  updatedAt: string;
  uploadStatus: string;
  coverR2Key: string;
  cover?: string; // 拼接完全预览路径

  r2Key: string;
  result_vdo_url: string;
  result_vdo_preview_url: string;
  // author_name: string;
  // author_avatar_url: string;
  locale: string;
}

// 侧边栏菜单项
// const menuItems = [
//   { icon: Share2, label: "修改基本信息", id: "edit" },
//   { icon: ListOrdered, label: "转换视频进度", id: "progress" },
//   { icon: BadgeDollarSign, label: "限时订阅优惠", id: "pricing" },
// ];

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const locale = (params.locale as string) || 'zh';
  const t = useTranslations('video_convert.projectDetail');
  const t2 = useTranslations('landing');
  const header = t2.raw('header');
  // console.log('header', header)
  const router = useRouter();

  const [activeMenu, setActiveMenu] = useState('list');
  // const [isExpanded, setIsExpanded] = useState(false);
  const [videoDetail, setVideoDetail] = useState<VideoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAudioModalLoading, setIsAudioModalLoading] = useState(true);
  const [error, setError] = useState('');
  const [descExpanded, setDescExpanded] = useState(false);
  const [playVideo, setPlayVideo] = useState<string>('');
  const [playVideoTitle, setPlayVideoTitle] = useState<string>('');
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  // 转换进度弹框状态
  const [isProgressDialogOpen, setIsProgressDialogOpen] = useState(false);
  const [taskMainId, setTaskMainId] = useState<string>(id);
  const [activeTabIdx, setActiveTabIdx] = useState<string>('0');
  // 新建转换弹框状态
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [projectSourceId, setProjectSourceId] = useState<string>(id);
  // 修改弹框
  const [projectItem, setProjectItem] = useState<Record<string, any>>({});
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [preUrl, setPreUrl] = useState<string>('');
  // 字幕对比弹框
  const [isCompareDialogOpen, setIsCompareDialogOpen] = useState(false);
  // 音频播放弹框
  const [showAudioModal, setShowAudioModal] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [subtitleAudioUrl, setSubtitleAudioUrl] = useState('');
  const [backgroundAudioUrl, setBackgroundAudioUrl] = useState('');
  // 删除确认弹框
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  // 轮询定时器ID
  const pollingTimerDetailRef = useRef<NodeJS.Timeout | null>(null);
  // 测试用视频列表数据
  // let taskMainList: any = [];
  const [taskMainList, setTaskMainList] = useState<Record<string, any>[]>([]);
  // 左侧封面图片状态
  const [leftCoverSrc, setLeftCoverSrc] = useState('/imgs/cover_video_def.jpg');

  const menuItems = [
    { icon: Share2, label: t('menu.editInfo'), id: 'edit' },
    { icon: ListOrdered, label: t('menu.progress'), id: 'progress' },
    { icon: BadgeDollarSign, label: t('menu.pricing'), id: 'pricing' },
  ];

  const onSonItemEditClick = (taskMainId: string) => {
    console.log('编辑视频转换，onSonItemEditClick--->', taskMainId);
    router.push(`/${locale}/video_convert/video-editor/${taskMainId}`);
  };

  // 修改项目后更新列表数据
  const onItemUpdateEvent = (changeItem: Record<string, any>) => {
    console.log('VideoConvertPage 接收到的 onItemUpdateEvent changeItem--->', changeItem);
    // 更新封面
    setLeftCoverSrc(changeItem.cover || '');
    setVideoDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        fileName: changeItem.fileName,
        cover: changeItem.cover, // + "?v=" + new Date().getTime(),
        content: changeItem.content,
      };
    });
  };

  const handlePlayVideo = (url: string, title: string) => {
    setPlayVideo(url);
    setPlayVideoTitle(title);
    setIsPlayerOpen(true);
  };

  const handleClosePlayer = () => {
    setIsPlayerOpen(false);
    setPlayVideoTitle('');
    setPlayVideo('');
  };
  const handlMenuClick = (item: any) => {
    console.log('[ProjectDetailPage] 点击菜单:', item.label);
    switch (item.id) {
      case 'list':
        // setActiveMenu("list");
        break;
      case 'progress':
        // 切换到进度条页面
        setActiveTabIdx('0');
        // 打开进度弹框
        setIsProgressDialogOpen(true);
        break;
      case 'create':
        setProjectSourceId('xxx');
        setIsAddDialogOpen(true);
        break;
      case 'edit':
        setProjectItem({ ...videoDetail });
        setIsEditDialogOpen(true);
        break;
      case 'backList':
        router.push(`/${locale}/video_convert/myVideoList`);
        break;
      case 'credits':
        router.push(`/${locale}/settings/credits`);
        break;
      case 'pricing':
        router.push(`/${locale}/pricing`);
        break;
      case 'delete':
        setShowDeleteDialog(true);
        break;
      default:
        break;
    }
  };
  const onDevelopClick = () => {
    // toast.info("新建功能正在开发中，敬请期待！");
    toast.success('新建功能正在开发中，敬请期待！');
  };

  // 删除视频
  const handleDelete = async () => {
    setShowDeleteDialog(false);
    try {
      const response = await fetch('/api/video-task/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskMainId: id }),
      });

      const result = await response.json();
      if (result.code === 0) {
        toast.success('删除成功');
        router.push(`/${locale}/video_convert/myVideoList`);
      } else {
        toast.error(result.message || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      toast.error('删除失败，请稍后重试');
    }
  };

  /**
   * 音频相关试听、下载
   * @param item
   * @param type
   */
  const onAudioClick = async (item: any, type: string) => {
    // e.stopPropagation();
    console.log('onAudioClick----->', item);
    if (!item) return;

    // 试听
    if (type === 'preview') {
      setShowAudioModal(true);
      if (!item.audio_bg_url || !item.audio_new_url) {
        setIsAudioModalLoading(true);
        try {
          if (!item.audio_bg_url) {
            const bgAudio = getAudioR2PathName(videoDetail?.userId || '', item.id, 'split_vocal_bkground/audio/audio_bkground.wav');
            const res = await fetch(`/api/storage/privater2-url?key=${encodeURIComponent(bgAudio)}`);
            const data = await res.json();
            if (data.code === 0) {
              console.log('获取私桶预览地址--bgAudio--->', data.data.url);
              item.audio_bg_url = data.data.url;
              setBackgroundAudioUrl(data.data.url);
            }
          }
          if (!item.audio_new_url) {
            const audioNew = getAudioR2PathName(videoDetail?.userId || '', item.id, 'merge_audios/audio/audio_new.wav');
            const res2 = await fetch(`/api/storage/privater2-url?key=${encodeURIComponent(audioNew)}`);
            const data2 = await res2.json();
            if (data2.code === 0) {
              console.log('获取私桶预览地址--audioNew--->', data2.data.url);
              item.audio_new_url = data2.data.url;
              setSubtitleAudioUrl(data2.data.url);
            }
          }
        } catch (error) {
          console.error('Failed to fetch video URL:', error);
        } finally {
          setIsAudioModalLoading(false);
        }
      }

    }
    // 音频下载
    else if (type === 'download') {
    } else if (type === 'subtitle') {
      const audioNew = getAudioR2PathName(videoDetail?.userId || '', item.id, 'merge_audios/audio/audio_new.wav');
      doDownloadAudio(item, audioNew);
    }
    // 背景音频下载
    else if (type === 'background') {
      const bgAudio = getAudioR2PathName(videoDetail?.userId || '', item.id, 'split_vocal_bkground/audio/audio_bkground.wav');
      doDownloadAudio(item, bgAudio);
    }
  };

  // 下载按钮点击
  const doDownloadAudio = async (taskMain: any, key: string) => {
    console.log('onDownLoadClick---taskMain--->', taskMain);
    try {
      // 调用下载 API 获取签名 URL，60秒过期
      const response = await fetch(`/api/video-task/download-audio?taskId=${taskMain.id}&key=${encodeURIComponent(key)}&expiresIn=60`);
      const data = await response.json();

      if (data.code !== 0) {
        toast.error(data.message || '获取下载链接失败');
        return;
      }

      console.log('[Download audio] 获取下载链接成功:', {
        url: data.data.url,
        expiresIn: data.data.expiresIn,
        currentTime: new Date().toISOString(),
      });

      // 创建隐藏的 a 标签触发下载
      const link = document.createElement('a');
      link.href = data.data.url;
      link.download = taskMain.fileName || 'taskMain.mp4';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log('[Download audio] 下载已触发');
    } catch (error) {
      console.error('[Download] 下载失败:', error);
      toast.error('下载失败，请稍后重试');
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

  // 获取视频详情
  useEffect(() => {
    const fetchVideoDetail = async () => {
      if (!id) {
        setError('缺少视频ID');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        console.log('[ProjectDetailPage] 页面加载，项目ID:', id);

        const response = await fetch(`/api/video-task/detail?fileId=${id}`);
        const backJO = await response.json();
        // {
        //     "code": 0,
        //     "message": "ok",
        //     "data": {
        //         "videoItem": {
        //             "id": "8bb54f6e-8572-44f5-a674-ae939b026c63",
        //             "userId": "99a30c57-88c1-4c93-9a4d-cea945a731be",
        //             "fileName": "test3.mp4",
        //             "fileSizeBytes": 2419199,
        //             "fileType": "video/mp4",
        //             "r2Key": "uploads/1765106611963-test3.mp4",
        //             "r2Bucket": "video-store",
        //             "videoDurationSeconds": 65,
        //             "checksumSha256": "",
        //             "uploadStatus": "pending",
        //             "coverR2Key": null,
        //             "coverSizeBytes": null,
        //             "coverUpdatedAt": null,
        //             "createdBy": "99a30c57-88c1-4c93-9a4d-cea945a731be",
        //             "createdAt": "2025-12-07T11:24:05.135Z",
        //             "updatedBy": "99a30c57-88c1-4c93-9a4d-cea945a731be",
        //             "updatedAt": "2025-12-07T11:24:05.135Z",
        //             "delStatus": 0
        //         },
        //         "taskList": [
        //             {
        //                 "id": "221e9937-c663-4de0-84ee-32a29aef6da6",
        //                 "userId": "99a30c57-88c1-4c93-9a4d-cea945a731be",
        //                 "originalFileId": "8bb54f6e-8572-44f5-a674-ae939b026c63",
        //                 "status": "pending",
        //                 "priority": 3,
        //                 "progress": 0,
        //                 "currentStep": null,
        //                 "sourceLanguage": "zh-CN",
        //                 "targetLanguage": "en-US",
        //                 "speakerCount": "single",
        //                 "processDurationSeconds": 0,
        //                 "creditId": "61986398-4a24-4650-b0ce-3ba50405dd11",
        //                 "creditsConsumed": 4,
        //                 "errorMessage": null,
        //                 "startedAt": null,
        //                 "completedAt": null,
        //                 "createdBy": "99a30c57-88c1-4c93-9a4d-cea945a731be",
        //                 "createdAt": "2025-12-07T11:24:06.605Z",
        //                 "updatedBy": "99a30c57-88c1-4c93-9a4d-cea945a731be",
        //                 "updatedAt": "2025-12-07T11:24:06.605Z",
        //                 "delStatus": 0
        //             }
        //         ]
        //     }
        // }

        if (backJO?.code !== 0) {
          setError(backJO?.message || '获取视频详情失败');
          return;
        }

        console.log('[ProjectDetailPage] 获取视频详情成功--->', backJO);
        const tempItem = backJO.data.videoItem;
        setVideoDetail({
          ...tempItem,
          // title: tempItem.fileName,
          // cover: tempItem.coverR2Key ? (backJO.data.preUrl + '/' + tempItem.coverR2Key) : '',
          cover: getPreviewCoverUrl(tempItem, backJO.data.preUrl),
          // coverSize: tempItem.coverSizeBytes,
          // coverR2Key: tempItem.coverR2Key,
        });
        // 预览前缀
        setPreUrl(backJO.data.preUrl);

        // 初始化测试用子视频列表数据
        setTaskMainList(backJO.data.taskList);
        // 设置任务ID用于轮询
        if (backJO.data.taskList?.[0]?.id) {
          setTaskMainId(backJO.data.taskList[0].id);
        }
        // 初始化可折叠状态
        // taskMainList.push({ id: 0 });
        // taskMainList.push({ id: 1 });
        // 创建新对象来触发状态更新
        setExpandedMap({
          id_row_0: true,
          // "id_row_1": false,
        });
      } catch (err) {
        console.error('[ProjectDetailPage] 获取视频详情失败:', err);
        setError('获取视频详情失败');
      } finally {
        setLoading(false);
      }
    };

    fetchVideoDetail();
  }, [id]);

  // 预加载左侧封面图片
  useEffect(() => {
    if (videoDetail?.coverR2Key && preUrl) {
      // const coverUrl = getPreviewUrl(videoDetail.userId, videoDetail.id, preUrl, videoDetail.coverR2Key);
      const img = new Image();
      img.src = videoDetail?.cover || '';
      img.onload = () => setLeftCoverSrc(videoDetail?.cover || '');
      img.onerror = () => setLeftCoverSrc('/imgs/cover_video_def.jpg');
    }
  }, [videoDetail?.coverR2Key, preUrl]);

  /**
   * 弹框中轮询结果回调回来
   * @param taskItem 
   */
  function onStatusUpdateEvent(taskItem: any) {
    // 如果任务已结束，至少掉一次接口更新界面
    if (taskItem.status === 'completed' || taskItem.status === 'failed' || taskItem.status === 'cancelled') {
      fetchTaskProgress();
    } 
    // 更新进度条等信息
    else {
      setTaskMainList([taskItem]);
    }
  }

  // API请求
  const fetchTaskProgress = useCallback(async () => {
    // setLoading(true);
    // console.warn('详情页请求taskMainId--->', taskMainId);
    try {
      const response = await fetch('/api/video-task/getTaskProgress?taskId=' + taskMainId);
      const result = await response.json();

      if (result.code === 0 && result.data) {
        const { taskItem } = result.data;
        console.log('详情页轮询请求结果--->', taskItem);
        // 更新任务信息
        setTaskMainList([taskItem]);
      }
    } catch (error) {
      console.error('获取转换进度失败:', error);
    } finally {
      // setLoading(false);
    }
  }, [taskMainId]);

  // 清除轮询定时器
  const clearPolling = useCallback(() => {
    if (pollingTimerDetailRef.current) {
      clearInterval(pollingTimerDetailRef.current);
      pollingTimerDetailRef.current = null;
      console.log('详情页轮询已停止');
    }
  }, []);

  // 启动轮询
  const startPolling = useCallback(() => {
    if (pollingTimerDetailRef.current) return;
    console.log('详情页轮询已启动--->', taskMainId);
    fetchTaskProgress();
    pollingTimerDetailRef.current = setInterval(fetchTaskProgress, 15000);
    console.log('详情页轮询已启动');
  }, [fetchTaskProgress]);

  // 轮询控制
  useEffect(() => {
    if (!taskMainList.length) return;

    const status = taskMainList[0]?.status;
    const shouldStop = status === 'completed' || status === 'failed' || status === 'cancelled';

    console.log('status, shouldStop, isProgressDialogOpen-->', status, shouldStop, isProgressDialogOpen)

    if (shouldStop) {
      clearPolling();
      return;
    }

    if ((status === 'processing' || status === 'pending') && !isProgressDialogOpen) {
      startPolling();
    } else {
      clearPolling();
    }

    return clearPolling;
  }, [taskMainList[0]?.status, isProgressDialogOpen, startPolling, clearPolling]);

  // 格式化时间
  // const formatDate = (dateStr: string) => {
  //   if (!dateStr) return "-";
  //   try {
  //     return new Date(dateStr).toLocaleString("zh-CN");
  //   } catch {
  //     return dateStr;
  //   }
  // };

  // 加载中
  if (loading) {
    return (
      <div className="bg-background fixed inset-0 z-50 flex flex-col overflow-hidden">
        {/* 面包屑骨架 */}
        <div className="bg-background shrink-0 border-b px-6 py-3">
          <div className="bg-muted h-5 w-64 animate-pulse rounded"></div>
        </div>

        {/* 主体内容 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左侧菜单栏骨架 */}
          <aside className="bg-card flex w-96 shrink-0 flex-col border-r">
            <div className="flex flex-1 flex-col overflow-y-hidden pb-0">
              {/* 视频播放器骨架 */}
              <div className="p-4">
                <div className="bg-muted relative aspect-video w-full animate-pulse overflow-hidden rounded-lg"></div>
              </div>

              {/* 基本信息骨架 */}
              <div className="space-y-3 px-4 pb-4">
                <div className="bg-muted h-6 w-3/4 animate-pulse rounded"></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted h-16 animate-pulse rounded"></div>
                  <div className="bg-muted h-16 animate-pulse rounded"></div>
                </div>
                <div className="bg-muted h-12 animate-pulse rounded"></div>
              </div>
            </div>

            {/* 底部按钮骨架 */}
            <div className="shrink-0">
              <div className="bg-muted h-px"></div>
              <div className="mt-2 space-y-2 px-2 pb-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="bg-muted h-10 animate-pulse rounded-lg"></div>
                ))}
              </div>
              <div className="flex shrink-0 flex-row border-t">
                <div className="bg-muted/50 h-12 flex-1 animate-pulse"></div>
                <div className="bg-muted/50 h-12 flex-1 animate-pulse border-l"></div>
              </div>
            </div>
          </aside>

          {/* 右侧内容区域骨架 */}
          <main className="flex-1 overflow-auto p-6">
            <div className="bg-card rounded-lg border-2">
              <div className="space-y-4 p-6">
                {/* 折叠时显示的内容 */}
                <div className="flex animate-pulse gap-6">
                  <div className="bg-muted aspect-video h-30 rounded-lg border-2"></div>
                  <div className="flex-1 space-y-3">
                    <div className="bg-muted h-6 w-3/4 rounded border"></div>
                    <div className="bg-muted mt-5 h-6 w-1/3 rounded border"></div>
                    <div className="bg-muted mt-5 mb-0 h-6 w-1/4 rounded border"></div>
                    <div className="-mt-6 flex justify-end gap-2">
                      <div className="bg-muted h-8 w-16 rounded border"></div>
                      <div className="bg-muted h-8 w-16 rounded border"></div>
                      <div className="bg-muted h-8 w-16 rounded border"></div>
                      <div className="bg-muted h-8 w-16 rounded border"></div>
                    </div>
                  </div>
                </div>

                {/* 展开时显示的详细信息骨架 */}
                <div className="animate-pulse space-y-4 border-t-2 pt-4">
                  <div className="bg-muted h-6 w-32 rounded border"></div>
                  {/* 进度条 */}
                  <div className="bg-muted h-20 w-full rounded-lg border"></div>
                  <div className="grid grid-cols-9 gap-2">
                    {[...Array(9)].map((_, i) => (
                      <div key={i} className="bg-muted h-8 rounded"></div>
                    ))}
                  </div>

                  <div className="bg-muted mt-6 h-6 w-32 rounded border"></div>
                  <div className="grid grid-cols-2 gap-4">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="bg-muted h-16 rounded border"></div>
                    ))}
                  </div>

                  <div className="mt-6 flex gap-6">
                    <div className="flex-1 space-y-3 rounded-lg border-2 p-4">
                      <div className="bg-muted mx-auto h-6 w-24 rounded"></div>
                      <div className="bg-muted h-12 rounded"></div>
                      <div className="flex justify-around">
                        <div className="bg-muted h-8 w-20 rounded border"></div>
                        <div className="bg-muted h-8 w-20 rounded border"></div>
                      </div>
                    </div>
                    <div className="flex-1 space-y-3 rounded-lg border-2 p-4">
                      <div className="bg-muted mx-auto h-6 w-24 rounded"></div>
                      <div className="bg-muted h-12 rounded"></div>
                      <div className="flex justify-around">
                        <div className="bg-muted h-8 w-20 rounded border"></div>
                        <div className="bg-muted h-8 w-20 rounded border"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  // 错误
  if (error) {
    return (
      <div className="bg-background fixed inset-0 z-50 flex items-center justify-center">
        <div className="text-lg text-red-500">{error}</div>
      </div>
    );
  }

  // 下载按钮点击
  const onDownLoadClick = async (e: any, taskMain: any) => {
    e.stopPropagation();
    console.log('onDownLoadClick---taskMain--->', taskMain);
    const finalFileList = taskMain?.finalFileList;
    if (!finalFileList || finalFileList?.length === 0) {
      toast.error('暂无可下载的视频链接');
      return;
    }
    // preview、video、subtitle
    const videoFinalItem = finalFileList.find((itm: any) => itm.fileType === 'video');
    if (!videoFinalItem) {
      toast.error('暂无可下载的视频链接');
      return;
    }

    try {
      // 从 URL 中提取文件 key
      // 假设 result_vdo_url 格式为: https://domain.com/bucket/path/to/file.mp4
      const url = new URL(preUrl + '/' + videoFinalItem.r2Key);
      let key = url.pathname.substring(1); // 移除开头的 /

      // 如果路径包含 bucket 名称，需要移除它
      // 例如：bucket-name/path/to/file.mp4 -> path/to/file.mp4
      const pathParts = key.split('/');
      if (pathParts.length > 1) {
        // 假设第一部分可能是 bucket 名称，但为了安全起见，保留完整路径
        // 如果你的 URL 格式是 https://domain.com/bucket/key，取消下面的注释
        // key = pathParts.slice(1).join('/');
      }
      // console.log("[Download] 开始下载，文件 key:", key);
      const bucketName = videoFinalItem.r2Bucket;

      // 调用下载 API 获取签名 URL，60秒过期
      const response = await fetch(
        `/api/video-task/download-video?taskId=${taskMain.id}&bucket=${bucketName}&key=${encodeURIComponent(key)}&expiresIn=60`
      );
      const data = await response.json();

      if (data.code !== 0) {
        toast.error(data.message || '获取下载链接失败');
        return;
      }

      console.log('[Download] 获取下载链接成功:', {
        url: data.data.url,
        taskMain,
        videoDetail,
        expiresIn: data.data.expiresIn,
        // expiresAt: data.data.expiresAt,
        currentTime: new Date().toISOString(),
      });
      

      // 创建隐藏的 a 标签触发下载
      const link = document.createElement('a');
      link.href = data.data.url;
      // 跨域限制（最常见的原因）download 属性要求文件与页面同源（相同协议、域名、端口）。
      link.download = videoDetail?.fileName || 'taskMain.mp4';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log('[Download] 下载已触发');
    } catch (error) {
      console.error('[Download] 下载失败:', error);
      toast.error('下载失败，请稍后重试');
    }
  };

  // 下载字幕
  const onDownloadSrtClick = async (e: any, stepName: string) => {
    e.stopPropagation();
    try {
      // let tempId = 'b09ff18a-c03d-4a27-9f41-6fa5d33fdb9b';
      // let name = 'translate_srt';
      let videoName = videoDetail?.fileName || '';
      let downloadUrl = '';
      if (stepName === 'double_srt') {
        downloadUrl = `/api/video-task/download-double-srt?taskId=${taskMainId}&stepName=${stepName}`;
      } else {
        downloadUrl = `/api/video-task/download-one-srt?taskId=${taskMainId}&stepName=${stepName}`;
      }
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        const error = await response.json();
        toast.error(error.message || '下载字幕失败');
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${stepName}_${taskMainId}.srt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('[SRT Download] 失败:', error);
      toast.error('下载字幕失败，请稍后重试');
    }
  };

  const getPreviewVideoUrl = (taskMain: any, type: string) => {
    return taskMain?.finalFileList?.find((finalFile: any) => finalFile.fileType === type)?.r2Key;
  };

  const image: React.CSSProperties = {
    width: '100%',
    height: '100%',
  };

  const shape: React.CSSProperties = {
    strokeWidth: 6,
    strokeLinecap: 'round',
    fill: 'transparent',
  };

  return (
    <div className="bg-background fixed inset-0 z-50 flex flex-col overflow-hidden">
      {/* 面包屑导航 */}
      <div className="bg-card flex shrink-0 items-center justify-between border-b px-6 py-3">
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
                <Link href={`/${locale}/video_convert/myVideoList`}>{t('breadcrumb.myVideos')}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{videoDetail?.fileName || '项目详情'}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mr-2 flex flex-row items-center gap-6">
          <LocaleSelector type="button" />
          <ThemeToggler type="toggle" />
          {/* <SignUser userNav={header.user_nav} /> */}
        </div>
      </div>

      {/* 主体内容 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧菜单栏 */}
        <LeftMenuPanel
          videoDetail={videoDetail}
          leftCoverSrc={leftCoverSrc}
          menuItems={menuItems}
          activeMenu={activeMenu}
          handlMenuClick={handlMenuClick}
          handlePlayVideo={handlePlayVideo}
          t={t}
        />

        {/* 右侧内容区域 */}
        <RightContentPanel
          t={t}
          locale={locale}
          taskMainList={taskMainList}
          videoDetail={videoDetail}
          preUrl={preUrl}
          expandedMap={expandedMap}
          onExpandChange={(index) => {
            const key = `id_row_${index}`;
            setExpandedMap({
              ...expandedMap,
              [key]: !expandedMap[key],
            });
          }}
          onPlayVideo={handlePlayVideo}
          onDownLoadClick={onDownLoadClick}
          onSonItemEditClick={onSonItemEditClick}
          onProgressClick={(taskMainId, tabIdx) => {
            setTaskMainId(taskMainId);
            setActiveTabIdx(tabIdx);
            setIsProgressDialogOpen(true);
          }}
          onDevelopClick={onDevelopClick}
          onAudioClick={onAudioClick}
          onDownloadSrtClick={onDownloadSrtClick}
          onCompareClick={() => setIsCompareDialogOpen(true)}
        />
      </div>

      {/* 视频播放器模态框 */}
      {playVideo && <VideoPlayerModal isOpen={isPlayerOpen} onClose={handleClosePlayer} videoUrl={playVideo} title={playVideoTitle} />}

      {/* 转换进度弹框 */}
      <ConversionProgressModal
        isOpen={isProgressDialogOpen}
        onClose={() => setIsProgressDialogOpen(false)}
        onStatusUpdateEvent={onStatusUpdateEvent}
        taskMainId={taskMainId}
        activeTabIdx={activeTabIdx}
      />

      {/* 转换进度弹框 */}
      <ConvertAddModal
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        projectSourceId={projectSourceId} />

      {/* 修改视频转换弹框 */}
      <ProjectUpdateModal
        projectItem={projectItem}
        isOpen={isEditDialogOpen}
        onUpdateEvent={onItemUpdateEvent}
        onClose={() => setIsEditDialogOpen(false)}
      />

      {/* 字幕对比弹框 */}
      <CompareSrtModal
        isOpen={isCompareDialogOpen}
        onDownBtnsClick={onDownloadSrtClick}
        onClose={() => setIsCompareDialogOpen(false)}
        taskId={taskMainId}
      />

      <audio ref={audioRef} className="hidden" />

      {/* 音频播放弹框 */}
      <AudioPlayModal
        audioRef={audioRef}
        isLoading={isAudioModalLoading}
        isOpen={showAudioModal}
        onClose={() => setShowAudioModal(false)}
        subtitleAudioUrl={subtitleAudioUrl}
        backgroundAudioUrl={backgroundAudioUrl}
      />

      {/* 删除确认弹框 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('deleteDialog.title')}</DialogTitle>
            <DialogDescription>{t('deleteDialog.description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>{t('deleteDialog.cancel')}</Button>
            <Button variant="destructive" onClick={handleDelete}>{t('deleteDialog.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
