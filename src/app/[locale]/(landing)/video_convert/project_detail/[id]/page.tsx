"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from 'sonner';
import { cn, formatDate, miao2Hms } from "@/shared/lib/utils";
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
} from "lucide-react";
import VideoPlayerModal from "@/shared/components/ui/video-player-modal";
import { ConversionProgressModal } from "@/shared/blocks/video-convert/convert-progress-modal";
import { ConvertAddModal } from "@/shared/blocks/video-convert/convert-add-modal";
import { ProjectUpdateModal } from "@/shared/blocks/video-convert/project-update-modal";
import { useRouter } from "next/navigation";
import { envConfigs } from "@/config";
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
  id: number;
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

  r2Key: string;
  result_vdo_url: string;
  result_vdo_preview_url: string;
  // author_name: string;
  // author_avatar_url: string;
  locale: string;
}

// 侧边栏菜单项
const menuItems = [
  // { icon: Video, label: "转换视频列表", id: "list" },
  { icon: Settings, label: "新建语种转换", id: "create" },
  { icon: Share2, label: "修改基本信息", id: "edit" },
  { icon: ListOrdered, label: "转换视频进度", id: "progress" },
  // { icon: FileText, label: "详细信息", id: "details" },
  // { icon: Share2, label: "基本信息编辑", id: "edit1" },
  // { icon: Share2, label: "基本信息编辑", id: "edit2" },
  // { icon: Share2, label: "基本信息编辑", id: "edit3" },
  // { icon: Share2, label: "分享", id: "share" },
  // { icon: Trash2, label: "删除", id: "delete" },
];



export default function ProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const locale = (params.locale as string) || "zh";
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
  // 轮询定时器ID
  const pollingTimerDetailRef = useRef<NodeJS.Timeout | null>(null);
  // 测试用视频列表数据
  // let taskMainList: any = [];
  const [taskMainList, setTaskMainList] = useState<Record<string, any>[]>([]);

  const onSonItemEditClick = (taskMainId: string) => {
    console.log("编辑视频转换，onSonItemEditClick--->", taskMainId);
    router.push(`/${locale}/video_convert/video-editor/${id}`);
  };

  // 修改项目后更新列表数据
  const onItemUpdateEvent = (changeItem: Record<string, any>) => {
    console.log("VideoConvertPage 接收到的 onItemUpdateEvent changeItem--->", changeItem);
    setVideoDetail((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        title: changeItem.title,
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
        setProjectItem({ ...videoDetail });
        setIsEditDialogOpen(true);
        break;
      case "share":
        // onDevelopClick();
        router.push(`/${locale}/video_convert/video-editor/`);
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
        setVideoDetail(backJO.data.videoItem);
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


  // API请求
  const fetchTaskProgress = useCallback(async () => {
    // setLoading(true);
    // console.warn('详情页请求taskMainId--->', taskMainId);
    try {
      const response = await fetch('/api/video-task/getTaskDetail?taskId=' + taskMainId);
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="text-lg text-muted-foreground">加载中...</div>
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


  // const statusInfo = statusMap[videoDetail?.status || ""] || { label: videoDetail?.status || "-", color: "text-gray-600" };

  const yyMap: any = {
    "zh-CN": "中文",
    "en-US": "英文",
  };
  const statusMap: any = {
    "pending": { label: "排队中", color: "text-cyan-600" },
    "processing": { label: "转换中", color: "text-orange-500" },
    "completed": { label: "转换成功", color: "text-green-600" },
    "failed": { label: "转换失败", color: "text-red-500" },
    "cancelled": { label: "已取消", color: "text-gray-500" },
  };


  const getConvertStr = (taskMain: any) => {
    return `${yyMap[taskMain?.sourceLanguage] || '未知语种'}转${yyMap[taskMain?.targetLanguage] || '未知语种'}`;
  }

  // 下载按钮点击
  const onDownLoadClick = async (e: any) => {
    e.stopPropagation();
    if (!videoDetail?.result_vdo_url) {
      alert("暂无可下载的视频链接");
      return;
    }

    try {
      // 从 URL 中提取文件 key
      // 假设 result_vdo_url 格式为: https://domain.com/bucket/path/to/file.mp4
      const url = new URL(videoDetail.result_vdo_url);
      let key = url.pathname.substring(1); // 移除开头的 /

      // 如果路径包含 bucket 名称，需要移除它
      // 例如：bucket-name/path/to/file.mp4 -> path/to/file.mp4
      const pathParts = key.split('/');
      if (pathParts.length > 1) {
        // 假设第一部分可能是 bucket 名称，但为了安全起见，保留完整路径
        // 如果你的 URL 格式是 https://domain.com/bucket/key，取消下面的注释
        // key = pathParts.slice(1).join('/');
      }
      console.log("[Download] 开始下载，文件 key:", key);

      // 调用下载 API 获取签名 URL，60秒过期
      const response = await fetch(`/api/video-convert/download?key=${encodeURIComponent(key)}&expiresIn=60`);
      const data = await response.json();

      if (data.code !== 0) {
        alert(data.message || "获取下载链接失败");
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
      link.download = videoDetail.fileName || 'taskMain.mp4';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log("[Download] 下载已触发");
    } catch (error) {
      console.error("[Download] 下载失败:", error);
      alert("下载失败，请稍后重试");
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
                  我的视频
                </Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{videoDetail?.fileName || "项目详情"}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* 主体内容 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧菜单栏 */}
        <aside className="flex flex-col border-r w-96 shrink-0 bg-muted/30">
          {/* 超出隐藏*/}
          <div className="flex flex-col flex-1 pb-0 overflow-y-hidden">
            {/* 视频播放器 */}
            <div className="p-4">
              <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
                {videoDetail?.r2Key ? (
                  <>
                    {videoDetail?.coverR2Key && (
                      <img
                        src={preUrl + '/' + videoDetail.coverR2Key}
                        // alt={videoDetail.fileName || "视频封面"}
                        onError={(e) => {
                          // e.currentTarget.src='/logo.png'// 设置默认图片
                          e.currentTarget.style.display = 'none';// 隐藏img
                        }}
                        className="h-full w-full object-cover"
                      />
                    )}
                    {/* onClick={() => setIsPlayingLeft(true)} */}
                    <button
                      onClick={() => handlePlayVideo(videoDetail.r2Key, videoDetail.fileName)}
                      className="absolute inset-0 flex items-center justify-center bg-black/30 transition-all hover:bg-black/40"
                    >
                      <div className="flex size-16 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform hover:scale-110">
                        <Play className="ml-1 size-8 text-black" fill="currentColor" />
                      </div>
                    </button>
                  </>
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                    <Video className="size-12 text-muted-foreground" />
                  </div>
                )}
              </div>
            </div>

            {/* 基本信息，可滚动内容区域 */}
            <div className="px-4 pb-4 space-y-3  overflow-y-scroll">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">原视频</p>
                <p className="font-semibold text-base text-primary">{videoDetail?.fileName || "-"}</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">原视频大小</p>
                  {/* <p className={cn("text-sm font-medium", statusInfo.color)}>{statusInfo.label}</p> */}
                  <p className="font-semibold text-base">{((videoDetail?.fileSizeBytes || 0) / 1024 / 1024).toFixed(2)}MB</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">原视频时长</p>
                  <p className="text-sm font-medium">{videoDetail?.videoDurationSeconds ? `${miao2Hms(videoDetail?.videoDurationSeconds)}` : "-"}</p>
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">原视频上传时间</p>
                <p className="text-sm font-medium">{formatDate(videoDetail?.createdAt || "")}</p>
              </div>

              {/* {videoDetail?.content && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">原视频内容介绍</p>
                  <div className="text-sm leading-relaxed">
                    <p className={cn(
                      "transition-all",
                      !descExpanded && "line-clamp-8"
                    )}>
                      {videoDetail.content}
                    </p>
                    {videoDetail.content.length > 200 && (
                      <button
                        onClick={() => setDescExpanded(!descExpanded)}
                        className="mt-1 text-xs text-primary hover:underline"
                      >
                        {descExpanded ? "收起" : "展开"}
                      </button>
                    )}
                  </div>
                </div>
              )} */}
            </div>



          </div>

          {/* 底部固定按钮区域 */}
          <div className="shrink-0">

            {/* 分隔虚线 */}
            <div aria-hidden
              className="mt-0 h-px min-w-0 [background-image:linear-gradient(90deg,var(--color-foreground)_1px,transparent_1px)] bg-[length:6px_1px] bg-repeat-x opacity-25" />

            {/* 菜单列表 */}
            <nav className="px-2 mt-2 pb-2">
              {menuItems.map((item) => (
                <button
                  key={item.id}
                  onClick={handlMenuClick.bind(null, item)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    activeMenu === item.id + 1
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </button>
              ))}
            </nav>
            {/* 底部水平两个按钮 */}
            <div className="flex flex-row shrink-0 border-t bg-black/40">
              <button
                onClick={handlMenuClick.bind(null, { id: "share" })}
                className={cn(
                  "flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white",
                  "hover:bg-primary/90 transition-colors"
                )}>
                <Share2 className="size-4" />
                分享
              </button>
              <button
                onClick={handlMenuClick.bind(null, { id: "delete" })}
                className={cn(
                  "flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-medium text-white",
                  "border-l border-primary-foreground/20 hover:bg-primary/90 transition-colors"
                )}>
                <Trash2 className="size-4" />
                删除
              </button>
            </div>
          </div>
        </aside>
        {/* 左侧菜单结束 */}

        {/* 右侧内容区域 */}
        <main className="flex-1 overflow-auto p-6">
          {/* 转换视频列表页面 */}
          {taskMainList.map((taskMain: any, index: number) => (
            <div key={index}>

              {/* 可折叠卡片 isExpanded*/}
              <Collapsible
                id={`row_id_${index}`}
                open={expandedMap[`id_row_${index}`]}
                onOpenChange={() => {
                  const key = `id_row_${index}`;
                  // 创建新对象来触发状态更新
                  setExpandedMap({
                    ...expandedMap,
                    [key]: !expandedMap[key],
                  });
                  console.log("[ProjectDetailPage] 折叠状态变化--" + index + "--->", expandedMap[`id_row_${index}`]);
                }}
                className="mb-5 transition-all duration-500 ease-in-out">
                <Card className="w-full pt-2 pb-0 gap-0">
                  <CardContent className="space-y-4">
                    {/* 折叠时显示的内容 - 上方左侧视频播放器 + 右侧基本信息 */}
                    <CollapsibleTrigger asChild>
                      <div className="flex gap-6 py-2 my-0">
                        {/* 列表中：头部视频封面 */}
                        <div className="grow-0 h-30 relative aspect-video overflow-hidden rounded-lg bg-black">
                          {getPreviewVideoUrl(taskMain, 'preview') ? (
                            <>
                              {videoDetail?.coverR2Key && (
                                <img
                                  src={preUrl + '/' + videoDetail.coverR2Key}
                                  onError={(e) => {
                                    // e.currentTarget.src='/logo.png'// 设置默认图片
                                    e.currentTarget.style.display = 'none';// 隐藏img
                                  }}
                                  className={cn(
                                    "h-30 object-cover aspect-video",
                                    taskMain?.status === "pending" && "animate-pulse"
                                  )}
                                />
                              )}
                              {/* onClick={() => setIsPlayingRight(true)} */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handlePlayVideo(getPreviewVideoUrl(taskMain, 'preview'), videoDetail?.fileName || '')
                                }}
                                className="absolute inset-0 flex items-center justify-center bg-black/30 transition-all hover:bg-black/40"
                              >
                                <div className="flex size-14 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform hover:scale-110">
                                  <Play className="ml-1 size-7 text-black" fill="currentColor" />
                                </div>
                              </button>
                            </>
                          ) : (
                            <div className="relative flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                              {/* animate-pulse呼吸灯动画 */}
                              <Video className="size-10 text-muted-foreground animate-pulse" />
                              {/* 直接插入组件 */}
                              {/* 描边动画 */}
                              <motion.svg
                                className="absolute inset-0"
                                width="100%"
                                height="100%"
                                style={image}
                              >
                                <defs>
                                  <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" stopColor="#818cf888" />
                                    <stop offset="100%" stopColor="#6a73cc88" />
                                  </linearGradient>
                                </defs>
                                <motion.rect
                                  width="100%"
                                  height="100%"
                                  x="0"
                                  y="0"
                                  rx="8"
                                  stroke="url(#gradient)"
                                  strokeDasharray="0.8 0.2"
                                  pathLength="1"
                                  animate={{ strokeDashoffset: [0, -1] }}
                                  transition={{ duration: 4, repeat: Infinity, ease: "easeIn" }}
                                  style={shape}
                                />
                              </motion.svg>
                            </div>
                          )}
                        </div>
                        {/* 列表中：头部基本信息 */}
                        <div className="grow space-y-3 mt-2">

                          <div className="flex justify-between space-y-1">
                            <p className="font-medium text-primary hover:text-primary/80">
                              {videoDetail?.fileName || "-"}
                              <span className={cn("ml-5 text-sm font-medium",
                                `${statusMap[taskMain?.status || ""]?.color}`
                              )}>
                                {`【${statusMap[taskMain?.status || ""]?.label}】`}
                              </span>
                              <span className={`ml-5 text-sm text-green-600`}>
                                【{getConvertStr(taskMain)}】
                              </span>
                            </p>
                            <ChevronDown
                              className={cn(
                                "size-5 text-muted-foreground transition-all duration-500 ease-in-out",
                                expandedMap[`id_row_${index}`] && "rotate-180"
                              )}
                            />
                            {/* </button> */}

                          </div>
                          <div className="space-y-1">

                            {/* <span className={cn("ml-10 text-sm font-medium", statusInfo.color)}>{statusInfo.label}</span> */}
                            <span className="ml-0 font-medium">{taskMain?.processDurationSeconds ? `目标视频时长：${miao2Hms(taskMain?.processDurationSeconds)} ` : "-"}</span>
                            {/* <span className="ml-10 font-medium">转换用时：2分24秒</span> */}
                            {/* <span className="ml-10 font-medium">当前步骤：{taskMain?.current_step || '排队中'}</span> */}
                          </div>

                          <div className="flex justify-between items-end">
                            <span className="inline-block font-medium">{`开始转换时间：${formatDate(taskMain?.startedAt || "")}`}</span>
                            {/* 操作按钮 - 右下角 */}
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" 
                              disabled={taskMain?.status !== "completed"}
                              onClick={onDownLoadClick}>
                                <Download className="size-4" />
                                下载
                              </Button>
                              {/* 当status为pending时，改按钮才可以点击 */}
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={taskMain?.status !== "completed"}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onSonItemEditClick("convert_" + index);
                                }}>
                                <Edit2 className="size-4" />
                                编辑
                              </Button>
                              <Button variant="outline" size="sm" onClick={(e) => {
                                e.stopPropagation();
                                setTaskMainId(taskMain?.id);
                                // 切换到进度条页面
                                setActiveTabIdx("1");
                                setIsProgressDialogOpen(true);
                              }}>
                                <ListOrdered className="size-4" />
                                进度
                              </Button>
                              <Button variant="destructive" size="sm" 
                              onClick={(e) => {
                                e.stopPropagation();
                                onDevelopClick();
                              }}>
                                <BookmarkX className="size-4" />
                                取消
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </CollapsibleTrigger>

                    {/* 展开时显示的详细信息 */}
                    <CollapsibleContent className="overflow-hidden transition-all data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                      {/* <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up"> */}

                      {/* 分隔虚线 */}
                      <div aria-hidden
                        className="my-5 h-px min-w-0 [background-image:linear-gradient(90deg,var(--color-foreground)_1px,transparent_1px)] bg-[length:6px_1px] bg-repeat-x opacity-25" />

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div
                            className="flex items-center gap-1 px-0 mx-0 text-lg text-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setTaskMainId(taskMain?.id);
                              // 切换到进度条页面
                              setActiveTabIdx("1");
                              setIsProgressDialogOpen(true);
                            }}>
                            转换进度 <CircleEllipsis className="size-4" />
                            {/* </Button> */}
                          </div>
                          <span className="text-2xl font-bold text-primary">
                            {taskMain?.progress}%
                          </span>
                        </div>
                        <div className="relative h-2 w-full rounded-full bg-gray-600">
                          <div
                            className="h-full rounded-full bg-primary opacity-50"
                            style={{width: `${taskMain?.progress}%`}}/>

                          <motion.div
                            className="absolute top-0 h-full rounded-full bg-primary"
                            initial={{ width: 0 }}
                            animate={{ width: `${taskMain?.progress}%` }}
                            transition={{ duration: 1.5, ease: "easeOut", repeat: Infinity, repeatDelay: 3 }}
                          />
                        </div>

                        {/* 步骤展示 */}
                        <div className="pt-1 flex flex-row justify-between gap-2">
                          {[
                            { name: '音视频分离', range: [0, 11] },
                            { name: '人声背景分离', range: [12, 22] },
                            { name: '生成原始字幕', range: [23, 33] },
                            { name: '翻译字幕', range: [34, 44] },
                            { name: '音频切片', range: [45, 55] },
                            { name: '语音合成', range: [56, 66] },
                            { name: '音频时间对齐', range: [67, 77] },
                            { name: '合并音频', range: [78, 88] },
                            { name: '合并音视频', range: [89, 100] },
                          ].map((step, index) => {
                            const progress = taskMain?.progress || 0;
                            const isActive = progress >= step.range[0] && progress <= step.range[1];
                            const isCompleted = progress > step.range[1];

                            return (
                              <div key={index} className="text-center">
                                <p className={cn(
                                  "flex flex-row items-center gap-1 text-xs font-medium transition-colors",
                                  isActive && "text-primary font-semibold",
                                  isCompleted && "text-green-600",
                                  !isActive && !isCompleted && "text-gray-400"
                                )}>
                                  {step.name}
                                  {isActive && (<Loader2 className="size-4 animate-spin text-primary" />)}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </div>


                      <div className="pt-0 mt-4 space-y-4">

                        {/* <Button variant="ghost" size="sm" */}
                        <div
                          className="flex items-center gap-1 px-0 mx-0 text-lg text-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTaskMainId(taskMain?.id);
                            // 切换到进度条页面
                            setActiveTabIdx("1");
                            setIsProgressDialogOpen(true);
                          }}>
                          基本信息 <CircleEllipsis className="size-4" />
                          {/* </Button> */}
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">目标视频语言</p>
                            <p className="font-medium">英语</p>
                            {/* <p className={cn("text-sm font-medium", statusInfo.color)}>{statusInfo.label}</p> */}
                          </div>
                          {/* <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">转换耗时</p>
                            <p className="font-medium">4分21秒</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">目标视频大小</p>
                            <p className="font-medium">157.87M</p>
                          </div> */}
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">目标视频时长</p>
                            <p className="font-medium">{miao2Hms(taskMain?.processDurationSeconds)} </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">开始转换时间</p>
                            <p className="font-medium">{formatDate(taskMain?.startedAt || "")}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">转换结束时间</p>
                            <p className="font-medium">{formatDate(taskMain?.completedAt || "")}</p>
                          </div>
                        </div>

                        {/* {false && videoDetail?.description && (
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">描述</p>
                            <p className="font-medium text-sm leading-relaxed">
                              {videoDetail.description}
                            </p>
                          </div>
                        )}

                        {false && videoDetail?.content && (
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">内容</p>
                            <p className="font-medium text-sm leading-relaxed">
                              {videoDetail.content}
                            </p>
                          </div>
                        )} */}

                        {/* 分隔虚线 */}
                        <div aria-hidden
                          className="mt-8 mb-0 h-px min-w-0 [background-image:linear-gradient(90deg,var(--color-foreground)_1px,transparent_1px)] bg-[length:6px_1px] bg-repeat-x opacity-25" />

                        {/* 底部 */}
                        <div className="flex space-y-0 gap-6">
                          <div className="flex-1 gap-6 mt-5 mb-5">
                            <p className="text-primary text-lg text-muted-foreground text-center">音频</p>
                            <p className="text-sm text-muted-foreground my-5 text-center">视频转换成功后，音频也可以单独下载，在下载前，建议您先试听一下。</p>
                            <div className="flex justify-around mt-2 gap-2">
                              <Button variant="outline" size="sm" onClick={onDevelopClick}>
                                <Share2 className="size-4" />
                                试听
                              </Button>
                              <Button variant="outline" size="sm" onClick={onDevelopClick}>
                                <Download className="size-4" />
                                下载
                              </Button>
                            </div>
                          </div>

                          {/* 分隔虚线 */}
                          <div aria-hidden
                            className="my-0 min-h-full min-w-1 [background-image:linear-gradient(0deg,var(--color-foreground)_1px,transparent_1px)] bg-[length:1px_6px] bg-repeat-y opacity-25" />

                          <div className="flex-1 gap-6 mt-5 mb-5">
                            <p className="text-primary text-lg text-muted-foreground text-center">字幕</p>
                            <p className="text-sm text-muted-foreground my-5 text-center">视频转换成功后，字幕可以单独下载，翻译后的字幕可以和原视频字幕对比。</p>
                            <div className="flex justify-around mt-2 gap-2">
                              <Button variant="outline" size="sm" onClick={onDevelopClick}>
                                <Edit className="size-4" />
                                对比
                              </Button>
                              <Button variant="outline" size="sm" onClick={onDevelopClick}>
                                <Download className="size-4" />
                                下载
                              </Button>
                            </div>
                          </div>


                          {/* <div className="space-y-1 text-sm">

                        {videoDetail?.source_vdo_url && (
                          <p>
                            <span className="text-muted-foreground">原视频: </span>
                            <a
                              href={videoDetail.source_vdo_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline break-all"
                            >
                              查看
                            </a>
                          </p>
                        )}
                        {videoDetail?.result_vdo_url && (
                          <p>
                            <span className="text-muted-foreground">转换后: </span>
                            <a
                              href={videoDetail.result_vdo_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline break-all"
                            >
                              查看
                            </a>
                          </p>
                        )}
                      </div> */}
                        </div>


                      </div>
                    </CollapsibleContent>
                  </CardContent>
                </Card>
              </Collapsible>
            </div>
          ))}
          {/* 水平居中加好 */}
          <div className="flex justify-center items-center w-24 h-24 mx-auto border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-black/30 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => {
              setProjectSourceId("xxx");
              setIsAddDialogOpen(true);
            }}>
            <Plus className="w-8 h-8 text-gray-400" />
          </div>

        </main>
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
    </div>
  );
}
