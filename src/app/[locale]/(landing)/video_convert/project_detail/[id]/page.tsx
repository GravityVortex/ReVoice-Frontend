"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/shared/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
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
import {
  ChevronDown,
  Video,
  Settings,
  FileText,
  Share2,
  Trash2,
  Home,
} from "lucide-react";

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
  { icon: Video, label: "视频预览", id: "preview" },
  { icon: Settings, label: "转换设置", id: "settings" },
  { icon: FileText, label: "详细信息", id: "details" },
  { icon: Share2, label: "分享", id: "share" },
  { icon: Trash2, label: "删除", id: "delete" },
];

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

  const [activeMenu, setActiveMenu] = useState("preview");
  const [isExpanded, setIsExpanded] = useState(false);
  const [videoDetail, setVideoDetail] = useState<VideoDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
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
        <aside className="w-64 shrink-0 overflow-y-auto border-r bg-muted/30">
          {/* 视频封面 */}
          <div className="p-4">
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-muted">
              {videoDetail?.cover_url ? (
                <img
                  src={videoDetail.cover_url}
                  alt={videoDetail.title || "视频封面"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-muted to-muted/50">
                  <Video className="size-8 text-muted-foreground" />
                </div>
              )}
            </div>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              ID: {id}
            </p>
          </div>

          {/* 菜单列表 */}
          <nav className="px-2 pb-4">
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveMenu(item.id);
                  console.log("[ProjectDetailPage] 点击菜单:", item.label);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  activeMenu === item.id
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
          <h1 className="mb-6 text-2xl font-bold">{videoDetail?.title || "项目详情"}</h1>

          {/* 可折叠卡片 */}
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <Card className="w-full">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">视频转换信息</CardTitle>
                  <CollapsibleTrigger asChild>
                    <button
                      className="rounded-full p-1.5 hover:bg-muted transition-colors"
                      onClick={() =>
                        console.log(
                          "[ProjectDetailPage] 折叠状态切换:",
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
              </CardHeader>

              <CardContent className="space-y-4">
                {/* 主要信息 - 始终显示 */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">项目ID</p>
                    <p className="font-medium">{id}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">状态</p>
                    <p className={cn("font-medium", statusInfo.color)}>{statusInfo.label}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">视频标题</p>
                    <p className="font-medium">{videoDetail?.title || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">时长</p>
                    <p className="font-medium">{videoDetail?.duration ? `${videoDetail.duration} 秒` : "-"}</p>
                  </div>
                </div>

                {/* 详细信息 - 展开时显示 */}
                <CollapsibleContent>
                  <div className="border-t pt-4 mt-4 space-y-4">
                    <h4 className="font-semibold text-sm text-muted-foreground">
                      详细信息
                    </h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">创建时间</p>
                        <p className="font-medium">{formatDate(videoDetail?.created_at || "")}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">更新时间</p>
                        <p className="font-medium">{formatDate(videoDetail?.updated_at || "")}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">UUID</p>
                        <p className="font-medium text-xs break-all">{videoDetail?.uuid || "-"}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">作者</p>
                        <p className="font-medium">{videoDetail?.author_name || "-"}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">语言</p>
                        <p className="font-medium">{videoDetail?.locale || "-"}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">用户UUID</p>
                        <p className="font-medium text-xs break-all">{videoDetail?.user_uuid || "-"}</p>
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

                    {/* 视频链接 */}
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">视频链接</p>
                      <div className="space-y-1 text-sm">
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
                      </div>
                    </div>
                  </div>
                </CollapsibleContent>
              </CardContent>
            </Card>
          </Collapsible>
        </main>
      </div>
    </div>
  );
}
