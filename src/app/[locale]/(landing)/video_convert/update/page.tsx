"use client";

import { useSearchParams, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { ArrowLeft, Save } from "lucide-react";

export default function VideoUpdatePage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const videoId = searchParams.get("id");

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    content: "",
    cover_url: "",
    source_vdo_url: "",
    result_vdo_url: "",
    duration: "",
  });

  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [error, setError] = useState("");

  // 组件首次加载时从API加载视频数据
  useEffect(() => {
    // 获取视频详情接口
    const doGetVideoDetailFromNet = async () => {
      if (!videoId) {
        setError("缺少视频ID");
        setFetchLoading(false);
        return;
      }

      try {
        setFetchLoading(true);
        setError("");

        // 接口获取视频详情
        const response = await fetch(`/api/video-convert/detail?id=${videoId}`);
        const data = await response.json();

        if (data?.code !== 0) {
          setError(data?.message || "获取视频详情失败");
          return;
        }
        // 获取视频详情成功
        const videoData = data.data;
        // 绑定到表单
        setFormData({
          title: videoData.title || "",
          description: videoData.description || "",
          content: videoData.content || "",
          cover_url: videoData.cover_url || "",
          source_vdo_url: videoData.source_vdo_url || "",
          result_vdo_url: videoData.result_vdo_url || "",
          duration: videoData.duration || "",
        });
      } catch (err) {
        console.error("获取视频详情失败:", err);
        setError("获取视频详情失败");
      } finally {
        setFetchLoading(false);
      }
    };
    // 调用接口获取视频详情
    doGetVideoDetailFromNet();
  }, [videoId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("/api/video-convert/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: videoId,
          ...formData,
        }),
      });

      const data = await response.json();

      if (data?.code === 0) {
        console.log("视频更新成功:", data.data);
        // 返回列表页
        router.back();
      } else {
        setError(data?.message || "更新视频失败");
      }
    } catch (error) {
      console.error("更新视频失败:", error);
      setError("更新视频失败");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // 加载中
  if (fetchLoading) {
    return (
      <div className="container mx-auto max-w-3xl py-8">
        <div className="flex justify-center items-center py-12">
          <div className="text-lg">加载中...</div>
        </div>
      </div>
    );
  }

  // 错误
  if (error) {
    return (
      <div className="container mx-auto max-w-3xl py-8">
        <div className="flex justify-center items-center py-12">
          <div className="text-red-500 text-lg">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl py-8">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => router.back()}
          className="mb-4"
        >
          <ArrowLeft className="mr-2 size-4" />
          返回列表
        </Button>
        <h1 className="text-3xl font-bold">编辑视频</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 左侧：表单 */}
        <Card>
          <CardHeader>
            <CardTitle>视频信息</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">

              {/* 封面图URL */}
              {false && (
                <div className="space-y-2">
                  <Label htmlFor="cover_url">封面图URL</Label>
                  <Input
                    id="cover_url"
                    value={formData.cover_url}
                    onChange={(e) => handleChange("cover_url", e.target.value)}
                    placeholder="https://example.com/cover.jpg"
                    type="url"
                  />
                </div>
              )}

              {/* 封面预览 */}
              {formData.cover_url && (
                <div className="space-y-2">
                  <Label>封面预览</Label>
                  <img
                    src={formData.cover_url}
                    alt="封面预览"
                    className="w-full rounded-lg border object-cover"
                    style={{ maxHeight: "200px" }}
                  />
                </div>
              )}

              {/* 视频标题 */}
              <div className="space-y-2">
                <Label htmlFor="title">视频标题</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => handleChange("title", e.target.value)}
                  placeholder="输入视频标题"
                  required
                />
              </div>

              {/* 视频描述 */}
              <div className="space-y-2">
                <Label htmlFor="description">视频描述</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  placeholder="输入视频描述"
                />
              </div>



              {/* 视频内容 */}
              <div className="space-y-2">
                <Label htmlFor="content">视频内容</Label>
                <Textarea
                  id="content"
                  value={formData.content}
                  onChange={(e) => handleChange("content", e.target.value)}
                  placeholder="输入视频详细内容"
                  rows={4}
                />
              </div>


              {/* 视频时长 */}
              {false && (
                <div className="space-y-2">
                  <Label htmlFor="duration">视频时长（秒）</Label>
                  <Input
                    id="duration"
                    value={formData.duration}
                    onChange={(e) => handleChange("duration", e.target.value)}
                    placeholder="例如: 123"
                    type="number"
                  />
                  <p className="text-xs text-muted-foreground">
                    请输入视频时长的秒数
                  </p>
                </div>
              )}

              {/* 提交按钮 */}
              <div className="flex gap-3">
                <Button type="submit" disabled={loading} className="flex-1">
                  <Save className="mr-2 size-4" />
                  {loading ? "保存中..." : "保存修改"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                >
                  取消
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* 右侧：视频预览 */}
        <Card>
          <CardHeader>
            <CardTitle>视频预览</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 视频播放器 */}
            {formData.source_vdo_url ? (
              <div className="space-y-2">
                <Label>原视频</Label>
                <video
                  src={formData.source_vdo_url}
                  controls
                  className="w-full rounded-lg border"
                  style={{ maxHeight: "300px" }}>
                  您的浏览器不支持视频播放
                </video>
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 bg-gray-100 rounded-lg border-2 border-dashed border-gray-300">
                <p className="text-gray-500">暂无视频</p>
              </div>
            )}




            {/* 转换后的视频 */}
            {formData.result_vdo_url ? (
              <div className="space-y-2">
                <Label>转换后的视频</Label>
                <video
                  src={formData.result_vdo_url}
                  controls
                  className="w-full rounded-lg border"
                  style={{ maxHeight: "300px" }}
                >
                  您的浏览器不支持视频播放
                </video>
              </div>
            ) : (
              <div className="flex items-center justify-center h-48 bg-gray-500 rounded-lg border-2 border-dashed border-gray-400">
                <p className="text-white">还未转换好，请稍等！</p>
              </div>
            )}

            {/* 视频信息 <strong>视频ID:</strong> {videoId} {formData.title} */}
            <div className="space-y-2 text-sm text-gray-600">
              {true && formData.duration && (
                <div className="flex flex-row justify-between">
                  <div>
                    <strong>视频时长：{formData.duration}秒</strong> 
                  </div>
                  <div>
                    <a className={formData.result_vdo_url ? "text-primary" : "text-gray-500"}
                      href={formData.result_vdo_url || "#"}
                      target={formData.result_vdo_url ? "_blank" : "_self"}>
                      {formData.result_vdo_url ? "下载视频" : "稍后下载"}
                    </a>
                  </div>
                </div>
              )}
            </div>


          </CardContent>
        </Card>
      </div>
    </div>
  );
}
