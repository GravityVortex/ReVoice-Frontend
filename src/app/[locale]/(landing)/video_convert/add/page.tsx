"use client";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
// import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from 'next-intl';
// 视频上传：仅 mp4，预览 + 按钮上传，限制 300MB
import React, { useMemo, useState } from "react";
import { useAppContext } from "@/shared/contexts/app";
import { Textarea } from "@/shared/components/ui/textarea";

function formatMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}

function formatDuration(seconds: number): string {
  if (seconds === 0) return "";
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export default function UploadMp4() {
  const t = useTranslations('landing.souldub_gate');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>("");
  const [uploadedUrl, setUploadedUrl] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [content, setContent] = useState<string>("");
  const [duration, setDuration] = useState<number>(0);

  const router = useRouter();
  const { user } = useAppContext();

  const MAX_SIZE = 300 * 1024 * 1024; // 300MB

  // 文件信息
  const fileInfo = useMemo(() => {
    if (!file) return "";
    const durationText = duration > 0 ? ` - ${formatDuration(duration)}` : "";
    return `${file.name} (${formatMB(file.size)}${durationText})`;
  }, [file, duration]);

  // 重置状态
  function resetState() {
    setError("");
    setUploadedUrl("");
    // setUploading(true);
  }

  // 文件选择变化
  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    console.log("onFileChange--->", e);
    // resetState();
    const f = e.target.files?.[0] || null;
    if (!f) {
      // setFile(null);
      // setPreviewUrl("");
      // setDuration(0);
      return;
    }

    // 类型与后缀双重判断
    const isMp4 = f.type === "video/mp4" || f.name.toLowerCase().endsWith(".mp4");
    if (!isMp4) {
      setError("仅支持 .mp4 文件");
      setFile(null);
      setPreviewUrl("");
      setDuration(0);
      return;
    }

    if (f.size > MAX_SIZE) {
      setError("文件过大，最大 300MB");
      setFile(null);
      setPreviewUrl("");
      setDuration(0);
      return;
    }
    // 获取视频时长
    const url = URL.createObjectURL(f);
    const video = document.createElement('video');
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src);
      const videoDuration = video.duration;
      // 保留1位小数
      const formattedDuration = Math.round(videoDuration * 10) / 10;
      setDuration(formattedDuration);
      console.log('视频时长--->', formattedDuration, '秒');
    };

    video.src = url;
    setFile(f);
    setPreviewUrl(url);
  }

  async function onUpload() {
    setError("");
    setUploadedUrl("");
    if (!file) {
      setError("请先选择 mp4 文件");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("文件过大，最大 300MB");
      return;
    }

    const fd = new FormData();
    fd.append("file", file);
    fd.append("prefix", "video-convert"); // 可选：自定义存储前缀
    fd.append("user_uuid", user?.id || "");
    fd.append("title", title);
    fd.append("duration", duration.toFixed(1));
    fd.append("description", description);
    fd.append("content", content); // 可以添加更多内容字段

    setUploading(true);
    try {
      //const res = await fetch("/api/demo/upload-file", {
      const res = await fetch("/api/video-convert/add", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      console.log('backJO--->', data);
      if (data?.code === 0) {
        setUploadedUrl(data.data.url as string);
        // 返回列表页面
        router.back();
      } else {
        setError(data?.message || "上传失败");
      }
    } catch (e) {
      setError("上传失败");
    } finally {
      setUploading(false);
    }
  }

  // Access Control Logic
  const { configs } = useAppContext();
  const isGloballyEnabled = (configs || {})['souldub_enabled'] === 'true';
  const hasAccess = isGloballyEnabled || (user && user.souldubAccess);

  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6">
        <div className="p-4 rounded-full bg-primary/10">
          <span className="text-4xl">🎉</span>
        </div>
        <h1 className="text-3xl font-bold">{t('title')}</h1>
        <p className="text-muted-foreground max-w-md" dangerouslySetInnerHTML={{ __html: t.raw('description') }} />
        <Button variant="outline" onClick={() => router.back()}>
          {t('return_back')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        onClick={() => router.back()}
        className="mb-4">
        <ArrowLeft className="mr-2 size-4" />
        返回列表
      </Button>

      <Card>
        {/* <CardHeader>
          <CardTitle>上传视频</CardTitle>
        </CardHeader> */}
        <CardContent>
          <div className="space-y-5 mb-5">
            <div className="flex flex-row">
              <Label className="w-[80px]" htmlFor="title">视频标题</Label>
              <Input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="请输入视频标题"
                className="mt-1"
              />
            </div>

            <div className="flex flex-row">
              <Label className="w-[80px]" htmlFor="description">视频描述</Label>
              <Input
                id="description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="请输入视频描述"
                className="mt-1"
              />
            </div>
            <div className="flex flex-row">
              <Label className="w-[80px]" htmlFor="content">视频内容</Label>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="请输入视频内容"
                className="mt-1"
              />
            </div>


            <div className="flex flex-row items-center">
              <Label className="w-[80px]" htmlFor="id_file">选择视频</Label>
              <input
                id="id_file"
                type="file"
                accept="video/mp4"
                onChange={onFileChange}
                disabled={uploading}
                className="hidden"
              />
              <label
                htmlFor="id_file"
                className="flex items-center justify-center w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 hover:bg-gray-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={uploading ? { pointerEvents: 'none', opacity: 0.5 } : {}}
              >
                <Plus className="w-8 h-8 text-gray-400" />
              </label>
            </div>
          </div>

          {/* 选择后先展示本地预览 */}
          {previewUrl && !uploadedUrl && (
            <div>
              {/* <p className="text-sm mb-2">本地预览</p> w-full max-w-2xl */}
              <video src={previewUrl} controls className="max-h-[50vh] rounded" />
              {fileInfo && <div className="text-sm text-green-500 mt-1 mb-2">{fileInfo}</div>}
              {error && <div className="text-sm text-red-600 mt-1 mb-2">{error}</div>}
            </div>
          )}

          <div>
            <Button
              onClick={onUpload}
              disabled={!file || uploading}
              className="px-4 py-2 rounded bg-blue-600 text-white disabled:bg-gray-400"
            >
              {uploading ? "上传中..." : "上传转换"}
            </Button>
          </div>

          {/* 上传成功后用远程地址预览 */}
          {false && uploadedUrl && (
            <div>
              <p className="text-sm mb-2">上传成功（远程预览）</p>
              <video src={uploadedUrl} controls className="w-full max-w-2xl rounded" />
              <div className="text-sm mt-2">
                <a className="text-blue-600 underline" href={uploadedUrl} target="_blank" rel="noreferrer">
                  {uploadedUrl}
                </a>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
