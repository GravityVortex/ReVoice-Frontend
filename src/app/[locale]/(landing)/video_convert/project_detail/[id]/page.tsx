"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from 'sonner';
import { cn, formatDate, getPreviewCoverUrl, getPreviewUrl, miao2Hms } from "@/shared/lib/utils";
import { Card, CardContent } from "@/shared/components/ui/card";
import { motion, Variants } from "motion/react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/shared/components/ui/collapsible";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/shared/components/ui/breadcrumb";
import { Button } from "@/shared/components/ui/button";
import {
  ChevronDown,
  Video,
  CircleEllipsis,
  Settings,
  Share2,
  ListOrdered,
  Trash2,
  Home,
  Play,
  Edit,
  Plus,
  Download,
  Edit2,
  Loader2,
  BookmarkX,
  Coins,
  ListOrderedIcon,
  BadgeDollarSign,
} from "lucide-react";
import VideoPlayerModal from "@/shared/components/ui/video-player-modal";
import { ConversionProgressModal } from "@/shared/blocks/video-convert/convert-progress-modal";
import { ConvertAddModal } from "@/shared/blocks/video-convert/convert-add-modal";
import { ProjectUpdateModal } from "@/shared/blocks/video-convert/project-update-modal";
import { CompareSrtModal } from "@/shared/blocks/video-convert/compare-srt-modal";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { envConfigs } from "@/config";
import { ThemeToggler } from "@/shared/blocks/common/theme-toggler";
import { LeftMenuPanel } from "./LeftMenuPanel";
import { RightContentPanel } from "./RightContentPanel";
import { LocaleSelector, SignUser } from "@/shared/blocks/common";

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
  const locale = (params.locale as string) || "zh";
  const t = useTranslations('video_convert.projectDetail');
  const t2 = useTranslations('landing');
  const header = t2.raw('header');
  // console.log('header', header)
  const router = useRouter();


  const [activeMenu, setActiveMenu] = useState("list");
  // const [isExpanded, setIsExpanded] = useState(false);
  const [videoDetail, setVideoDetail] = useState<VideoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [descExpanded, setDescExpanded] = useState(false);
  const [playVideo, setPlayVideo] = useState<string>("");
  const [playVideoTitle, setPlayVideoTitle] = useState<string>("");
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  // 转换进度弹框状态
  const [isProgressDialogOpen, setIsProgressDialogOpen] = useState(false);
  const [taskMainId, setTaskMainId] = useState<string>(id);
  const [activeTabIdx, setActiveTabIdx] = useState<string>("0");
  // 新建转换弹框状态
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [projectSourceId, setProjectSourceId] = useState<string>(id);
  // 修改弹框
  const [projectItem, setProjectItem] = useState<Record<string, any>>({});
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [preUrl, setPreUrl] = useState<string>("");
  // 字幕对比弹框
  const [isCompareDialogOpen, setIsCompareDialogOpen] = useState(false);
  // 轮询定时器ID
  const pollingTimerDetailRef = useRef<NodeJS.Timeout | null>(null);
  // 测试用视频列表数据
  // let taskMainList: any = [];
  const [taskMainList, setTaskMainList] = useState<Record<string, any>[]>([]);
  // 左侧封面图片状态
  const [leftCoverSrc, setLeftCoverSrc] = useState('/imgs/cover_video_def.jpg');


  const menuItems = [
    { icon: Share2, label: t('menu.editInfo'), id: "edit" },
    { icon: ListOrdered, label: t('menu.progress'), id: "progress" },
    { icon: BadgeDollarSign, label: t('menu.pricing'), id: "pricing" },
  ];


  const onSonItemEditClick = (taskMainId: string) => {
    console.log("编辑视频转换，onSonItemEditClick--->", taskMainId);
    router.push(`/${locale}/video_convert/video-editor/${taskMainId}`);
  };

  // 修改项目后更新列表数据
  const onItemUpdateEvent = (changeItem: Record<string, any>) => {
    console.log("VideoConvertPage 接收到的 onItemUpdateEvent changeItem--->", changeItem);
    setVideoDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        fileName: changeItem.fileName,
        cover_url: changeItem.cover,
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
    setPlayVideoTitle("");
    setPlayVideo("");
  };
  const handlMenuClick = (item: any) => {
    console.log("[ProjectDetailPage] 点击菜单:", item.label);
    switch (item.id) {
      case "list":
        // setActiveMenu("list");
        break;
      case "progress":
        // 切换到进度条页面
        setActiveTabIdx("0");
        // 打开进度弹框
        setIsProgressDialogOpen(true);
        break;
      case "create":
        setProjectSourceId("xxx");
        setIsAddDialogOpen(true);
        break;
      case "edit":
        setProjectItem({ ...videoDetail});
        setIsEditDialogOpen(true);
        break;
      case "backList":
        router.push(`/${locale}/video_convert/myVideoList`);
        break;
      case "credits":
        router.push(`/${locale}/settings/credits`);
        break;
      case "pricing":
        router.push(`/${locale}/pricing`);
        break;
      case "delete":
        onDevelopClick();
        break;
      default:
        break;
    }
  };
  const onDevelopClick = () => {
    // toast.info("新建功能正在开发中，敬请期待！");
    toast.success("新建功能正在开发中，敬请期待！");
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
        setError("缺少视频ID");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");
        console.log("[ProjectDetailPage] 页面加载，项目ID:", id);

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
          setError(backJO?.message || "获取视频详情失败");
          return;
        }

        console.log("[ProjectDetailPage] 获取视频详情成功--->", backJO);
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
          "id_row_0": true,
          // "id_row_1": false,
        });
      } catch (err) {
        console.error("[ProjectDetailPage] 获取视频详情失败:", err);
        setError("获取视频详情失败");
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
      img.src = videoDetail?.cover;
      img.onload = () => setLeftCoverSrc(videoDetail?.cover);
      img.onerror = () => setLeftCoverSrc('/imgs/cover_video_def.jpg');
    }
  }, [videoDetail?.coverR2Key, preUrl]);

  // API请求
  const fetchTaskProgress = useCallback(async () => {
    // setLoading(true);
    // console.warn('详情页请求taskMainId--->', taskMainId);
    try {
      const response = await fetch('/api/video-task/getTaskProgress?taskId=' + taskMainId);
      const result = await response.json();

      if (result.code === 0 && result.data) {
        const { taskItem } = result.data;
        console.log('详情页轮询请求结果--->', taskItem)
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
    fetchTaskProgress();
    pollingTimerDetailRef.current = setInterval(fetchTaskProgress, 15000);
    console.log('详情页轮询已启动');
  }, [fetchTaskProgress]);

  // 轮询控制
  useEffect(() => {
    if (!taskMainList.length) return;

    const status = taskMainList[0]?.status;
    const shouldStop = status === "completed" || status === "failed" || status === "cancelled";

    if (shouldStop) {
      clearPolling();
      return;
    }

    if (status === "processing" && !isProgressDialogOpen) {
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
      <div className="fixed inset-0 z-50 flex flex-col bg-background overflow-hidden">
        {/* 面包屑骨架 */}
        <div className="shrink-0 border-b bg-background px-6 py-3">
          <div className="h-5 w-64 bg-muted rounded animate-pulse"></div>
        </div>

        {/* 主体内容 */}
        <div className="flex flex-1 overflow-hidden">
          {/* 左侧菜单栏骨架 */}
          <aside className="flex flex-col border-r w-96 shrink-0 bg-muted/30">
            <div className="flex flex-col flex-1 pb-0 overflow-y-hidden">
              {/* 视频播放器骨架 */}
              <div className="p-4">
                <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-muted animate-pulse"></div>
              </div>

              {/* 基本信息骨架 */}
              <div className="px-4 pb-4 space-y-3">
                <div className="h-6 w-3/4 bg-muted rounded animate-pulse"></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-16 bg-muted rounded animate-pulse"></div>
                  <div className="h-16 bg-muted rounded animate-pulse"></div>
                </div>
                <div className="h-12 bg-muted rounded animate-pulse"></div>
              </div>
            </div>

            {/* 底部按钮骨架 */}
            <div className="shrink-0">
              <div className="h-px bg-muted"></div>
              <div className="px-2 mt-2 pb-2 space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-10 bg-muted rounded-lg animate-pulse"></div>
                ))}
              </div>
              <div className="flex flex-row shrink-0 border-t">
                <div className="flex-1 h-12 bg-muted/50 animate-pulse"></div>
                <div className="flex-1 h-12 bg-muted/50 border-l animate-pulse"></div>
              </div>
            </div>
          </aside>

          {/* 右侧内容区域骨架 */}
          <main className="flex-1 overflow-auto p-6">
            <div className="border-2 rounded-lg bg-card">
              <div className="p-6 space-y-4">
                {/* 折叠时显示的内容 */}
                <div className="flex gap-6 animate-pulse">
                  <div className="h-30 aspect-video bg-muted rounded-lg border-2"></div>
                  <div className="flex-1 space-y-3">
                    <div className="h-6 w-3/4 bg-muted rounded border"></div>
                    <div className="h-6 w-1/3 bg-muted rounded border mt-5"></div>
                    <div className="h-6 w-1/4 bg-muted rounded border mt-5 mb-0"></div>
                    <div className="flex justify-end gap-2 -mt-6">
                      <div className="h-8 w-16 bg-muted rounded border"></div>
                      <div className="h-8 w-16 bg-muted rounded border"></div>
                      <div className="h-8 w-16 bg-muted rounded border"></div>
                      <div className="h-8 w-16 bg-muted rounded border"></div>
                    </div>
                  </div>
                </div>

                {/* 展开时显示的详细信息骨架 */}
                <div className="space-y-4 pt-4 border-t-2 animate-pulse">
                  <div className="h-6 w-32 bg-muted rounded border"></div>
                  {/* 进度条 */}
                  <div className="h-20 w-full bg-muted rounded-lg border"></div>
                  <div className="grid grid-cols-9 gap-2">
                    {[...Array(9)].map((_, i) => (
                      <div key={i} className="h-8 bg-muted rounded"></div>
                    ))}
                  </div>

                  <div className="h-6 w-32 bg-muted rounded border mt-6"></div>
                  <div className="grid grid-cols-2 gap-4">
                    {[...Array(4)].map((_, i) => (
                      <div key={i} className="h-16 bg-muted rounded border"></div>
                    ))}
                  </div>

                  <div className="flex gap-6 mt-6">
                    <div className="flex-1 space-y-3 border-2 rounded-lg p-4">
                      <div className="h-6 w-24 bg-muted rounded mx-auto"></div>
                      <div className="h-12 bg-muted rounded"></div>
                      <div className="flex justify-around">
                        <div className="h-8 w-20 bg-muted rounded border"></div>
                        <div className="h-8 w-20 bg-muted rounded border"></div>
                      </div>
                    </div>
                    <div className="flex-1 space-y-3 border-2 rounded-lg p-4">
                      <div className="h-6 w-24 bg-muted rounded mx-auto"></div>
                      <div className="h-12 bg-muted rounded"></div>
                      <div className="flex justify-around">
                        <div className="h-8 w-20 bg-muted rounded border"></div>
                        <div className="h-8 w-20 bg-muted rounded border"></div>
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="text-lg text-red-500">{error}</div>
      </div>
    );
  }



  // 下载按钮点击
  const onDownLoadClick = async (e: any, taskMain: any) => {
    e.stopPropagation();
    console.log('onDownLoadClick---taskMain--->', taskMain)
    const finalFileList = taskMain?.finalFileList;
    if (!finalFileList || finalFileList?.length === 0) {
      toast.error("暂无可下载的视频链接");
      return;
    }
    // preview、video、subtitle
    const videoFinalItem = finalFileList.find((itm: any) => itm.fileType === 'video');
    if (!videoFinalItem) {
      toast.error("暂无可下载的视频链接");
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
      const response = await fetch(`/api/video-task/download-video?bucket=${bucketName}&key=${encodeURIComponent(key)}&expiresIn=60`);
      const data = await response.json();

      if (data.code !== 0) {
        toast.error(data.message || "获取下载链接失败");
        return;
      }

      console.log("[Download] 获取下载链接成功:", {
        url: data.data.url,
        expiresIn: data.data.expiresIn,
        expiresAt: data.data.expiresAt,
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

      console.log("[Download] 下载已触发");
    } catch (error) {
      console.error("[Download] 下载失败:", error);
      toast.error("下载失败，请稍后重试");
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
        downloadUrl = `/api/video-task/download-srt?taskId=${taskMainId}&stepName=${stepName}`;
      }
      const response = await fetch(downloadUrl);
      // const response = await fetch(`/api/video-task/download-srt?taskId=${tempId}&stepName=${name}&fileName=${videoName}`);
      if (!response.ok) {
        const error = await response.json();
        toast.error(error.message || "下载字幕失败");
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
      console.error("[SRT Download] 失败:", error);
      toast.error("下载字幕失败，请稍后重试");
    }
  };

  const getPreviewVideoUrl = (taskMain: any, type: string) => {
    return taskMain?.finalFileList?.find((finalFile: any) => finalFile.fileType === type)?.r2Key;
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background overflow-hidden">
      {/* 面包屑导航 */}
      <div className="shrink-0 border-b bg-background px-6 py-3 flex items-center justify-between">
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
                  {t('breadcrumb.myVideos')}
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{videoDetail?.fileName || "项目详情"}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-row gap-6 items-center mr-2">
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
          onDownloadSrtClick={onDownloadSrtClick}
          onCompareClick={() => setIsCompareDialogOpen(true)}
        />
      </div>


      {/* 视频播放器模态框 */}
      {playVideo && (
        <VideoPlayerModal
          isOpen={isPlayerOpen}
          onClose={handleClosePlayer}
          videoUrl={playVideo}
          title={playVideoTitle}
        />
      )}

      {/* 转换进度弹框 */}
      <ConversionProgressModal
        isOpen={isProgressDialogOpen}
        onClose={() => setIsProgressDialogOpen(false)}
        taskMainId={taskMainId}
        activeTabIdx={activeTabIdx}
      />


      {/* 转换进度弹框 */}
      <ConvertAddModal
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        projectSourceId={projectSourceId}
      />

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
    </div>
  );
}
