"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from 'sonner';
import { cn } from "@/shared/lib/utils";
import { Card, CardContent } from "@/shared/components/ui/card";
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
  Settings,
  Share2,
  ListOrdered,
  Trash2,
  Home,
  Play,
  Edit,
  Download,
} from "lucide-react";
import VideoPlayerModal from "@/shared/components/ui/video-player-modal";
import { ConversionProgressModal } from "@/shared/blocks/video-convert/convert-progress-modal";

// 视频详情数据类型
interface VideoDetail {
  id: number;
  uuid: string;
  user_uuid: string;
  title: string;
  duration: string;
  description: string;
  content: string;
  created_at: string;
  updated_at: string;
  status: string;
  cover_url: string;
  source_vdo_url: string;
  result_vdo_url: string;
  result_vdo_preview_url: string;
  author_name: string;
  author_avatar_url: string;
  locale: string;
}

// 侧边栏菜单项
const menuItems = [
  { icon: Video, label: "转换视频列表", id: "list" },
  { icon: ListOrdered, label: "转换视频进度", id: "progress" },
  { icon: Settings, label: "新建语种转换", id: "create" },
  // { icon: FileText, label: "详细信息", id: "details" },
  { icon: Share2, label: "基本信息编辑", id: "edit" },
  { icon: Share2, label: "分享", id: "share" },
  { icon: Trash2, label: "删除", id: "delete" },
];
// 测试用视频列表数据
let sonVideoList: any = [];

// 状态映射
const statusMap: Record<string, { label: string; color: string }> = {
  success: { label: "转换成功", color: "text-green-600" },
  processing: { label: "转换中", color: "text-orange-500" },
  failed: { label: "转换失败", color: "text-red-500" },
};

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const locale = (params.locale as string) || "zh";

  const [activeMenu, setActiveMenu] = useState("list");
  const [isProgressDialogOpen, setIsProgressDialogOpen] = useState(false);
  // const [isExpanded, setIsExpanded] = useState(false);
  const [videoDetail, setVideoDetail] = useState<VideoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [descExpanded, setDescExpanded] = useState(false);
  const [playVideo, setPlayVideo] = useState<string>("");
  const [playVideoTitle, setPlayVideoTitle] = useState<string>("");
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [converId, setConvertId] = useState<string>(id);

  // const expandedMap: Record<string, boolean> = {
  //   // "id_row_0": true,
  // };

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
        setActiveMenu("list");
        break;
      case "progress":
        // 打开进度弹框
        setIsProgressDialogOpen(true);
        break;
      case "create":
        onDevelopClick();
        break;
      case "edit":
        onDevelopClick();
        break;
      case "share":
        onDevelopClick();
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

        const response = await fetch(`/api/video-convert/detail?id=${id}`);
        const data = await response.json();

        if (data?.code !== 0) {
          setError(data?.message || "获取视频详情失败");
          return;
        }

        console.log("[ProjectDetailPage] 获取视频详情成功:", data.data);
        setVideoDetail(data.data);

        // 初始化测试用子视频列表数据
        sonVideoList = [];
        // 初始化可折叠状态
        sonVideoList.push({ id: 0 });
        sonVideoList.push({ id: 1 });
        // 创建新对象来触发状态更新
        setExpandedMap({
          "id_row_0": true,
          "id_row_1": false,
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

  // 格式化时间
  const formatDate = (dateStr: string) => {
    if (!dateStr) return "-";
    try {
      return new Date(dateStr).toLocaleString("zh-CN");
    } catch {
      return dateStr;
    }
  };

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

  const statusInfo = statusMap[videoDetail?.status || ""] || { label: videoDetail?.status || "-", color: "text-gray-600" };

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
      link.download = videoDetail.title || 'video.mp4';
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
              <BreadcrumbPage>{videoDetail?.title || "项目详情"}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* 主体内容 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧菜单栏 */}
        <aside className="w-96 shrink-0 overflow-y-auto border-r bg-muted/30">
          {/* 视频播放器 */}
          <div className="p-4">
            <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black">
              {videoDetail?.source_vdo_url ? (
                <>
                  {videoDetail?.cover_url && (
                    <img
                      src={videoDetail.cover_url}
                      alt={videoDetail.title || "视频封面"}
                      className="h-full w-full object-cover"
                    />
                  )}
                  {/* onClick={() => setIsPlayingLeft(true)} */}
                  <button
                    onClick={() => handlePlayVideo(videoDetail.source_vdo_url, videoDetail.title)}
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

          {/* 基本信息 */}
          <div className="px-4 pb-4 space-y-3">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">视频标题</p>
              <p className="font-semibold text-base">{videoDetail?.title || "-"}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">视频状态</p>
                <p className={cn("text-sm font-medium", statusInfo.color)}>{statusInfo.label}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">视频时长</p>
                <p className="text-sm font-medium">{videoDetail?.duration ? `${videoDetail.duration}秒` : "-"}</p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">创建时间</p>
              <p className="text-sm font-medium">{formatDate(videoDetail?.created_at || "")}</p>
            </div>

            {videoDetail?.content && (
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">内容</p>
                <div className="text-sm leading-relaxed">
                  <p className={cn(
                    "transition-all",
                    !descExpanded && "line-clamp-3"
                  )}>
                    {videoDetail.content}
                  </p>
                  {videoDetail.content.length > 100 && (
                    <button
                      onClick={() => setDescExpanded(!descExpanded)}
                      className="mt-1 text-xs text-primary hover:underline"
                    >
                      {descExpanded ? "收起" : "展开"}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>


          {/* 分隔虚线 */}
          <div
            aria-hidden
            className="mt-0 h-px min-w-0 [background-image:linear-gradient(90deg,var(--color-foreground)_1px,transparent_1px)] bg-[length:6px_1px] bg-repeat-x opacity-25"
          />

          {/* 菜单列表 */}
          <nav className="px-2 mt-8">
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
        </aside>

        {/* 右侧内容区域 */}
        <main className="flex-1 overflow-auto p-6">
          {/* 转换视频列表页面 */}
          {sonVideoList.map((video: any, index: number) => (
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
                <Card className="w-full py-2 gap-0">

                  {/* <CardHeader className="pb-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">视频详情</CardTitle>
                  <CollapsibleTrigger asChild>
                    <button
                      className="rounded-full p-1.5 hover:bg-muted transition-colors"
                      onClick={() =>
                        console.log(
                          "[ProjectDetailPage] 折叠状态切换--->",
                          !isExpanded ? "展开" : "折叠"
                        )
                      }
                    >
                      <ChevronDown
                        className={cn(
                          "size-5 text-muted-foreground transition-transform duration-200",
                          isExpanded && "rotate-180"
                        )}
                      />
                    </button>
                  </CollapsibleTrigger>
                </div>
              </CardHeader> */}

                  <CardContent className="space-y-4">
                    {/* 折叠时显示的内容 - 上方左侧视频播放器 + 右侧基本信息 */}
                    <div className="flex gap-6 my-2">
                      {/* 右侧：视频播放器 */}
                      <div className="grow-0 h-30 relative aspect-video overflow-hidden rounded-lg bg-black">
                        {videoDetail?.result_vdo_preview_url || videoDetail?.result_vdo_preview_url ? (
                          <>
                            {videoDetail?.cover_url && (
                              <img
                                src={videoDetail.cover_url}
                                alt={videoDetail.title || "视频封面"}
                                className="h-30  object-cover aspect-video"
                              />
                            )}
                            {/* onClick={() => setIsPlayingRight(true)} */}
                            <button
                              onClick={() => handlePlayVideo(videoDetail.result_vdo_preview_url, videoDetail.title)}
                              className="absolute inset-0 flex items-center justify-center bg-black/30 transition-all hover:bg-black/40"
                            >
                              <div className="flex size-14 items-center justify-center rounded-full bg-white/90 shadow-lg transition-transform hover:scale-110">
                                <Play className="ml-1 size-7 text-black" fill="currentColor" />
                              </div>
                            </button>
                          </>
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                            <Video className="size-10 text-muted-foreground" />
                          </div>
                        )}
                      </div>

                      {/* 右侧：基本信息 */}
                      <CollapsibleTrigger asChild>
                        <div className="grow space-y-3 mt-2">

                          <div className="flex justify-between space-y-1">
                            <p className="font-medium hover:text-primary">
                              {videoDetail?.title || "-"}
                              <span className={cn("ml-5 text-sm font-medium", statusInfo.color)}>{`【${statusInfo.label}】`}</span>
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
                            <span className="font-medium">类型：中文转英文</span>
                            {/* <span className={cn("ml-10 text-sm font-medium", statusInfo.color)}>{statusInfo.label}</span> */}
                            <span className="ml-10 font-medium">{videoDetail?.duration ? `视频时长：${videoDetail.duration} 秒` : "-"}</span>
                            <span className="ml-10 font-medium">转换时长：2分24秒</span>
                          </div>

                          <div className="flex justify-between align-center">
                            <p className="font-medium">{`创建时间：${formatDate(videoDetail?.created_at || "")}`}</p>
                            {/* 操作按钮 - 右下角 */}
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={onDownLoadClick}>
                                <Download className="size-4" />
                                下载
                              </Button>
                              <Button variant="outline" size="sm">
                                <Share2 className="size-4" />
                                分享
                              </Button>
                              <Button variant="outline" size="sm" onClick={(e) => {
                                e.stopPropagation();
                                // setConvertId(videoDetail?.id.toString() || "");
                                setConvertId("convert_" + index);
                                setIsProgressDialogOpen(true);
                              }}>
                                <ListOrdered className="size-4" />
                                进度
                              </Button>
                              <Button variant="destructive" size="sm">
                                <Trash2 className="size-4" />
                                删除
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CollapsibleTrigger>
                    </div>

                    {/* 展开时显示的详细信息 */}
                    <CollapsibleContent className="overflow-hidden transition-all data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up">
                      {/* <CollapsibleContent className="data-[state=open]:animate-collapsible-down data-[state=closed]:animate-collapsible-up"> */}
                      <div className="border-t pt-4 mt-4 space-y-4">
                        <h4 className="font-semibold text-sm text-muted-foreground">
                          详细信息
                        </h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">视频标题</p>
                            <p className="font-medium">{videoDetail?.title}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">视频状态</p>
                            <p className={cn("text-sm font-medium", statusInfo.color)}>{statusInfo.label}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">创建时间</p>
                            <p className="font-medium">{formatDate(videoDetail?.created_at || "")}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">更新时间</p>
                            <p className="font-medium">{formatDate(videoDetail?.updated_at || "")}</p>
                          </div>
                        </div>

                        {videoDetail?.description && (
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">描述</p>
                            <p className="font-medium text-sm leading-relaxed">
                              {videoDetail.description}
                            </p>
                          </div>
                        )}

                        {videoDetail?.content && (
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">内容</p>
                            <p className="font-medium text-sm leading-relaxed">
                              {videoDetail.content}
                            </p>
                          </div>
                        )}

                        {/* 底部 */}
                        <div className="flex space-y-3 gap-6">
                          <div className="flex-1 gap-6 ">
                            <p className="text-primary text-2xl text-muted-foreground text-center">音频</p>
                            <p className="text-sm text-muted-foreground my-5 text-left">视频转换成功后，音频也可以单独下载，在下载前，建议您先试听一下。</p>
                            <div className="flex justify-around mt-2 gap-2">
                              <Button variant="outline" size="sm">
                                <Share2 className="size-4" />
                                试听
                              </Button>
                              <Button variant="outline" size="sm" onClick={onDownLoadClick}>
                                <Download className="size-4" />
                                下载
                              </Button>
                            </div>
                          </div>
                          <div className="flex-1">
                            <p className="text-primary text-2xl text-muted-foreground text-center">字幕</p>
                            <p className="text-sm text-muted-foreground my-5 text-left">视频转换成功后，字幕可以单独下载，翻译后的字幕可以和原视频字幕对比。</p>
                            <div className="flex justify-around mt-2 gap-2">
                              <Button variant="outline" size="sm">
                                <Edit className="size-4" />
                                对比
                              </Button>
                              <Button variant="outline" size="sm" onClick={onDownLoadClick}>
                                <Download className="size-4" />
                                下载
                              </Button>
                            </div>
                          </div>


                          {/* <div className="space-y-1 text-sm">

                        {videoDetail?.source_vdo_url && (
                          <p>
                            <span className="text-muted-foreground">源视频: </span>
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
        convertId={converId}
      />
    </div>
  );
}
