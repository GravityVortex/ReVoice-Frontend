'use client';

import { useEffect, useState, useRef } from 'react';
import { cn } from '@/shared/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/shared/components/ui/dialog';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/shared/components/ui/select";
import { useAppContext } from "@/shared/contexts/app";
import { Check, ChevronRight, Languages, Clock, Video, Droplet, BookText, Plus, Trash2, Upload, Link, BadgeDollarSign, Crown, CircleDollarSign, MailCheck } from 'lucide-react';
import { toast } from 'sonner';


// 语言选项
const LANGUAGES = [
    { value: 'zh-CN', label: '中文（简体）' },
    { value: 'en-US', label: '英语' },
    { value: 'fr-FR', label: '法语' },
    { value: 'de-DE', label: '德语' },
    { value: 'ja-JP', label: '日语' },
    { value: 'ko-KR', label: '韩语' },
    // { value: 'es-ES', label: '西班牙语' },
    // { value: 'pt-PT', label: '葡萄牙语' },
];

// 清晰度选项
const RESOLUTIONS = [
    { value: '480p', label: '480P', credits: 0 },
    { value: '720p', label: '720P', credits: 10 },
    { value: '1080p', label: '1080P', credits: 20 },
];

// 水印选项
const WATERMARK_OPTIONS = [
    { value: 'none', label: '无水印', credits: 0 },
    { value: 'with', label: '有水印', credits: 0 },
];

interface VideoUploadData {
    title: string;
    content: string;
    videoUrl: string;
    videoKey: string;
    videoSize: number;
    videoDuration: number;
    thumbnailUrl?: string;
}

interface FormData {
    videoUpload: VideoUploadData;
    targetLanguage: string;
    resolution: string;
    watermark: string;
    remark: string;
}

interface ProjectAddConvertModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const STORAGE_KEY = 'project_add_convert_form_cache';
const MAX_SIZE = 300 * 1024 * 1024; // 300MB


export function ProjectAddConvertModal({
    isOpen,
    onClose,
}: ProjectAddConvertModalProps) {
    const [currentStep, setCurrentStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const { user } = useAppContext();
    const videoInputRef = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    // console.log("当前用户--->", user);


    // 视频时长数据（分钟）
    // const [videoDuration, setVideoDuration] = useState(0);
    // 视频上传状态
    const [uploading, setUploading] = useState(false);

    // 表单数据
    const [formData, setFormData] = useState<FormData>({
        videoUpload: {
            title: '',
            content: '',
            videoUrl: '',
            videoKey: '',
            videoSize: 0,
            videoDuration: 0,
            thumbnailUrl: '',
        },
        targetLanguage: '',// 目标语言
        resolution: '480p',// 分辨率
        watermark: 'none',// 水印
        remark: '',// 转换备注
    });


    // 从本地存储加载缓存数据
    useEffect(() => {
        if (isOpen) {
            const cached = localStorage.getItem(STORAGE_KEY);
            if (cached) {
                try {
                    const parsedData = JSON.parse(cached);
                    setFormData(parsedData);
                    // 如果有缓存的视频时长，恢复它
                    // if (parsedData.videoUpload?.videoUrl) {
                    //     // 从缓存的视频时长中恢复
                    //     const cachedDuration = localStorage.getItem(`${STORAGE_KEY}_duration`);
                    //     if (cachedDuration) {
                    //         setVideoDuration(parseFloat(cachedDuration));
                    //     }
                    // }
                    console.log('从缓存加载表单数据:', parsedData);
                } catch (e) {
                    console.error('解析缓存数据失败:', e);
                }
            }
        }
    }, [isOpen]);

    // 计算消耗积分
    const calculateCredits = () => {
        const resolutionCredits = RESOLUTIONS.find(r => r.value === formData.resolution)?.credits || 0;
        const watermarkCredits = WATERMARK_OPTIONS.find(w => w.value === formData.watermark)?.credits || 0;
        const durationInMinutes = Math.ceil(formData.videoUpload.videoDuration / 60);
        const durationCredits = durationInMinutes * 2; // 1分钟2积分
        return resolutionCredits + watermarkCredits + durationCredits;
    };

    // 获取时长积分
    const getDurationCredits = () => {
        const durationInMinutes = Math.ceil(formData.videoUpload.videoDuration / 60);
        return durationInMinutes * 2; // 1分钟2积分
    };

    // 保存到本地缓存
    const saveToCache = () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
        // localStorage.setItem(`${STORAGE_KEY}_duration`, videoDuration.toString());
        console.log('表单数据已缓存');
    };

    // 清除缓存
    const clearCache = () => {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(`${STORAGE_KEY}_duration`);
        console.log('缓存已清除');
    };

    const resetFormData = () => {
        setFormData({
            videoUpload: {
                title: '',
                content: '',
                videoUrl: '',
                videoKey: '',
                videoSize: 0,
                videoDuration: 0,
                thumbnailUrl: '',
            },
            targetLanguage: '',
            resolution: '480p',
            watermark: 'none',
            remark: '',
        });
    };

    // 处理视频文件选择
    const handleVideoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) {
            resetVideoData(false);
            return;
        }

        // 验证文件类型
        if (!file.type.startsWith('video/')) {
            toast.error('请选择视频文件');
            resetVideoData(false);
            return;
        }

        // 类型与后缀双重判断
        const isMp4 = file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4");
        if (!isMp4) {
            toast.error("仅支持 .mp4 文件");
            resetVideoData(false);
            return;
        }

        // 验证文件大小（500MB）
        const maxSize = 500 * 1024 * 1024;
        if (file.size > maxSize) {
            resetVideoData(false);
            toast.error('视频文件不能超过 500MB');
            return;
        }

        setUploading(true);
        try {
            // 上传视频
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('/api/storage/upload-video', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                resetVideoData(false);
                throw new Error('上传失败');
            }

            const result = await response.json();
            if (result.code !== 0) {
                resetVideoData(false);
                throw new Error(result.message || '上传失败');
            }

            const videoUrl = result.data.url;
            const videoKey = result.data.key;
            const videoSize = result.data.size;

            // 创建临时视频元素获取时长
            const video = document.createElement('video');
            video.preload = 'metadata';
            video.src = videoUrl;

            video.onloadedmetadata = () => {
                // const durationInMinutes = Math.ceil(video.duration / 60);
                // setVideoDuration(durationInMinutes);
                // URL.revokeObjectURL(video.src);
                // console.log('视频时长（分钟）:', durationInMinutes);

                window.URL.revokeObjectURL(video.src);
                const videoDuration = video.duration;// 单位秒
                // 保留1位小数
                const formattedDuration = Math.round(videoDuration * 10) / 10;
                // 更新表单项
                setFormData(prev => ({
                    ...prev,
                    videoUpload: {
                        ...prev.videoUpload,
                        videoDuration: formattedDuration,
                    },
                }));
                console.log('视频时长--->', formattedDuration, '秒');
            };

            // 尝试截取封面（可能失败）
            video.currentTime = 1; // 截取第1秒的画面
            video.onseeked = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
                        setFormData(prev => ({
                            ...prev,
                            videoUpload: {
                                ...prev.videoUpload,
                                thumbnailUrl,
                            },
                        }));
                    }
                } catch (error) {
                    console.log('截取封面失败（忽略）:', error);
                }
            };

            // 更新表单项
            setFormData(prev => ({
                ...prev,
                videoUpload: {
                    ...prev.videoUpload,
                    videoUrl,
                    videoKey,
                    videoSize,
                },
            }));
            toast.success('视频上传成功');
        } catch (error: any) {
            console.error('视频上传失败:', error);
            toast.error(error?.message || '视频上传失败');
        } finally {
            setUploading(false);
            if (videoInputRef.current) {
                videoInputRef.current.value = '';
            }
        }
    };


    const resetVideoDataClick = (e: any, showTip = true) => {
        resetVideoData(showTip);
    };

    // 删除视频
    const resetVideoData = (showTip = true) => {
        setFormData(prev => ({
            ...prev,
            videoUpload: {
                title: prev.videoUpload.title,
                content: prev.videoUpload.content,
                videoUrl: '',
                videoKey: '',
                videoSize: 0,
                videoDuration: 0,
                thumbnailUrl: '',
            },
        }));
        showTip && toast.success('视频已删除');
    };

    // 处理取消
    const handleCancel = () => {
        saveToCache();
        onClose();
    };

    // 处理第一步的下一步
    const handleStep1Next = () => {
        if (!formData.videoUpload.title.trim()) {
            toast.error('请输入视频标题');
            return;
        }
        if (!formData.videoUpload.videoUrl) {
            toast.error('请上传视频文件');
            return;
        }
        saveToCache();
        setCurrentStep(2);
    };

    // 处理第二步的下一步
    const handleStep2Next = () => {
        if (!formData.targetLanguage) {
            toast.error('请选择目标语言');
            return;
        }
        saveToCache();
        setCurrentStep(3);
    };

    // 处理上一步
    const handlePrevious = () => {
        saveToCache();
        if (currentStep === 2) {
            setCurrentStep(1);
        } else if (currentStep === 3) {
            setCurrentStep(2);
        }
    };

    // 处理提交
    const handleSubmit = async () => {

        setSubmitting(true);

        const payload = {
            // userId: user?.id || '',
            targetLanguage: formData.targetLanguage,
            resolution: formData.resolution,
            watermark: formData.watermark,
            remark: formData.remark,
            credits: calculateCredits(),
        };

        const fd = new FormData();
        fd.append("prefix", "video-convert"); // 可选：自定义存储前缀
        fd.append("user_uuid", user?.id || "");
        fd.append("title", formData.videoUpload.title);
        // fd.append("description", description);
        fd.append("content", formData.videoUpload.content); // 可以添加更多内容字段
        fd.append("source_vdo_url", formData.videoUpload.videoUrl); // 视频R2地址
        fd.append("videoSize", "" + formData.videoUpload.videoSize); // 视频大小
        fd.append("duration", "" + formData.videoUpload.videoDuration);
        try {
            //const res = await fetch("/api/demo/upload-file", {
            const res = await fetch("/api/video-convert/add-withvideourl", {
                method: "POST",
                body: fd,
            });
            const data = await res.json();
            console.log('backJO--->', data);
            if (data?.code === 0) {
                // 成功后清除缓存
                clearCache();

                // 重置表单
                resetFormData();
                setCurrentStep(1);

                alert('转换任务已创建！');
                onClose();
            } else {
                console.error('提交失败:', data);
            }
        } catch (e) {
            console.error('提交失败--->', e);

        } finally {
            setSubmitting(false);

        }


        try {


            console.log('提交转换任务:', payload);

            // 模拟 API 请求
            await new Promise(resolve => setTimeout(resolve, 1500));


        } catch (error) {

            alert('提交失败，请重试');
        } finally {
            setSubmitting(false);
        }
    };

    // 获取语言标签
    const getLanguageLabel = (value: string) => {
        return LANGUAGES.find(l => l.value === value)?.label || value;
    };

    // 获取清晰度标签
    const getResolutionLabel = (value: string) => {
        return RESOLUTIONS.find(r => r.value === value)?.label || value;
    };

    // 获取水印标签
    const getWatermarkLabel = (value: string) => {
        return WATERMARK_OPTIONS.find(w => w.value === value)?.label || value;
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl h-[780px] flex flex-col p-0">
                <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
                    <DialogTitle>上传视频转换</DialogTitle>
                    <DialogDescription className="sr-only">
                        上传视频，创建转换任务
                    </DialogDescription>

                    {/* 步骤指示器 */}
                    <div className="flex items-center justify-center mt-4 space-x-2">
                        <div className="flex items-center">
                            <div className={cn(
                                "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all",
                                currentStep === 1 ? "border-primary bg-primary text-primary-foreground" : "border-green-500 bg-green-500 text-white"
                            )}>
                                {currentStep > 1 ? <Check className="w-5 h-5" /> : "1"}
                            </div>
                            <span className={cn(
                                "ml-2 text-sm font-medium",
                                currentStep === 1 ? "text-primary" : "text-green-500"
                            )}>
                                上传视频
                            </span>
                        </div>

                        <ChevronRight className="w-5 h-5 text-muted-foreground" />

                        <div className="flex items-center">
                            <div className={cn(
                                "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all",
                                currentStep === 2 ? "border-primary bg-primary text-primary-foreground" : currentStep > 2 ? "border-green-500 bg-green-500 text-white" : "border-muted-foreground/30 text-muted-foreground"
                            )}>
                                {currentStep > 2 ? <Check className="w-5 h-5" /> : "2"}
                            </div>
                            <span className={cn(
                                "ml-2 text-sm font-medium",
                                currentStep === 2 ? "text-primary" : currentStep > 2 ? "text-green-500" : "text-muted-foreground"
                            )}>
                                配置参数
                            </span>
                        </div>

                        <ChevronRight className="w-5 h-5 text-muted-foreground" />

                        <div className="flex items-center">
                            <div className={cn(
                                "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all",
                                currentStep === 3 ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 text-muted-foreground"
                            )}>
                                3
                            </div>
                            <span className={cn(
                                "ml-2 text-sm font-medium",
                                currentStep === 3 ? "text-primary" : "text-muted-foreground"
                            )}>
                                确认转换
                            </span>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 pb-0">
                    {/* 第一步：上传视频 */}
                    {currentStep === 1 && (
                        <Card className="mt-2 pt-2 pb-5">
                            <CardContent className="pt-0 space-y-6">
                                {/* 视频标题 */}
                                <div className="space-y-2 mb-1">
                                    <Label htmlFor="videoTitle" className="text-base font-semibold">
                                        视频标题 <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                        id="videoTitle"
                                        value={formData.videoUpload.title}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            videoUpload: { ...formData.videoUpload, title: e.target.value }
                                        })}
                                        placeholder="请输入视频标题"
                                    />
                                </div>

                                {/* 视频内容 */}
                                <div className="space-y-2 mb-1">
                                    <Label htmlFor="videoContent" className="text-base font-semibold">
                                        视频内容
                                    </Label>
                                    <Textarea
                                        id="videoContent"
                                        value={formData.videoUpload.content}
                                        onChange={(e) => setFormData({
                                            ...formData,
                                            videoUpload: { ...formData.videoUpload, content: e.target.value }
                                        })}
                                        placeholder="请输入视频内容描述（可选）"
                                        rows={4}
                                    />
                                </div>

                                {/* 视频文件上传 */}
                                <div className="space-y-2 mb-1">
                                    <Label className="text-base font-semibold">
                                        视频文件 <span className="text-red-500">*</span>
                                    </Label>
                                    <input
                                        ref={videoInputRef}
                                        type="file"
                                        accept="video/*"
                                        onChange={handleVideoSelect}
                                        className="hidden"
                                    />

                                    {!formData.videoUpload.videoUrl ? (
                                        // onChange={onFileChange}
                                        <button
                                            type="button"
                                            onClick={() => videoInputRef.current?.click()}
                                            disabled={uploading}
                                            className="flex items-center justify-center w-full object-cover aspect-video border-2 border-dashed border-muted-foreground/30 rounded-lg hover:border-primary/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {uploading ? (
                                                <div className="text-center">
                                                    <Upload className="w-6 h-6 mx-auto mb-1 animate-pulse" />
                                                    <span className="text-xs">上传中...</span>
                                                </div>
                                            ) : (
                                                <Plus className="w-8 h-8 text-muted-foreground" />
                                            )}
                                        </button>
                                    ) : (
                                        <div className="relative inline-block">
                                            <video
                                                ref={videoRef}
                                                src={formData.videoUpload.videoUrl}
                                                controls
                                                className="w-full max-w-md h-auto rounded-lg border"
                                            />
                                            <Button
                                                size="icon"
                                                variant="destructive"
                                                className="absolute top-2 right-2"
                                                onClick={resetVideoDataClick}
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                            <div className="mt-2 text-sm text-muted-foreground">
                                                文件大小: {(formData.videoUpload.videoSize / 1024 / 1024).toFixed(2)} MB
                                                {formData.videoUpload.videoDuration > 0 && ` | 时长: ${Math.ceil(formData.videoUpload.videoDuration / 60)} 分钟`}
                                            </div>
                                        </div>
                                    )}
                                    <p className="text-xs text-muted-foreground mt-1">
                                        支持上传视频文件，大小不超过 500MB
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* 第二步：配置参数 */}
                    {currentStep === 2 && (
                        <Card className="mt-2 pt-2 pb-5">
                            <CardContent className="pt-0 space-y-6">
                                {/* 目标语言 */}
                                <div className="flex items-center justify-between gap-3 border-b pb-0 my-1">
                                    <div className="flex items-center gap-3 py-3">
                                        {/* <Languages className="w-5 h-5 text-primary" /> */}
                                        <Label htmlFor="targetLanguage" className="text-base font-medium whitespace-nowrap">
                                            目标语言 <span className="text-red-500">*</span>
                                        </Label>
                                    </div>
                                    <Select
                                        value={formData.targetLanguage}
                                        onValueChange={(value) => setFormData({ ...formData, targetLanguage: value })}
                                    >
                                        <SelectTrigger id="targetLanguage" className="flex-1 border-0 shadow-none bg-transparent hover:bg-transparent focus:bg-transparent data-[state=open]:bg-transparent dark:hover:bg-transparent font-medium h-auto py-3 pr-0 pl-4 [&>svg]:hidden [&>span]:ml-auto [&>span]:text-right focus:ring-0 focus:ring-offset-0">
                                            <SelectValue placeholder="请选择" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {LANGUAGES.map((lang) => (
                                                <SelectItem key={lang.value} value={lang.value} className="focus:bg-transparent hover:bg-transparent">
                                                    {lang.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <ChevronRight className="w-5 h-5 text-muted-foreground mr-0" />
                                </div>

                                {/* 原视频时长 */}
                                <div className="flex items-center justify-between gap-3 py-3 mb-4 border-b">
                                    <div className="flex items-center gap-3">
                                        {/* <Clock className="w-5 h-5 text-primary" /> */}
                                        <Label className="text-base font-medium whitespace-nowrap">
                                            原视频时长 <span className="text-red-500">*</span>
                                        </Label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground">
                                            {formData.videoUpload.videoDuration > 0 ? `${Math.ceil(formData.videoUpload.videoDuration / 60)} 分钟` : '加载中...'}
                                        </span>
                                        {/* <ChevronRight className="w-5 h-5 text-muted-foreground" /> */}
                                    </div>
                                </div>

                                {/* 视频清晰度 */}
                                <div className="space-y-2 mb-4">
                                    <Label className="text-base font-semibold">
                                        {/* <Video className="w-5 h-5 text-primary" /> */}
                                        视频清晰度<span className="text-red-500">*</span></Label>
                                    <div className="flex gap-3">
                                        {RESOLUTIONS.map((res) => (
                                            <button
                                                key={res.value}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, resolution: res.value })}
                                                className={cn(
                                                    "flex-1 px-4 py-3 rounded-lg border-2 transition-all font-medium",
                                                    formData.resolution === res.value
                                                        ? "border-primary bg-primary/10 text-primary"
                                                        : "border-muted-foreground/30 hover:border-primary/50"
                                                )}
                                            >
                                                <div className="text-center">
                                                    <div className="text-lg">{res.label}</div>
                                                    <div className="text-xs text-muted-foreground mt-1">
                                                        {res.credits} 积分
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* 视频水印 */}
                                <div className="space-y-2 mb-4">
                                    <Label className="text-base font-semibold">
                                        {/* <Droplet className="w-5 h-5 text-primary" /> */}
                                        视频水印</Label>
                                    <div className="flex gap-3">
                                        {WATERMARK_OPTIONS.map((option) => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, watermark: option.value })}
                                                className={cn(
                                                    "flex-1 px-6 py-3 rounded-lg border-2 transition-all font-medium",
                                                    formData.watermark === option.value
                                                        ? "border-primary bg-primary/10 text-primary"
                                                        : "border-muted-foreground/30 hover:border-primary/50"
                                                )}
                                            >
                                                <div className="text-center">
                                                    <div className="text-lg">{option.label}</div>
                                                    <div className="text-xs text-muted-foreground mt-1">
                                                        {option.credits} 积分
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* 转换备注 */}
                                <div className="space-y-2">
                                    <Label htmlFor="remark" className="text-base font-semibold">
                                        {/* <BookText className="w-5 h-5 text-primary" /> */}
                                        视频转换备注</Label>
                                    <Textarea
                                        id="remark"
                                        value={formData.remark}
                                        onChange={(e) => setFormData({ ...formData, remark: e.target.value })}
                                        placeholder="请输入备注信息（可选）"
                                        rows={4}
                                    />
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* 第三步：确认信息 */}
                    {currentStep === 3 && (
                        <Card className="mt-2 pt-2">
                            <CardContent className="pt-0 space-y-6">
                                <div className="space-y-4">
                                    {/* <h3 className="mb-0 text-lg font-semibold text-primary">视频转换配置确认</h3> */}

                                    <div className="my-0 grid grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
                                        <div className="col-span-2 space-y-1">
                                            <p className="text-sm text-muted-foreground">视频标题</p>
                                            <p className="font-semibold">{formData.videoUpload.title}</p>
                                        </div>
                                        <div className="col-span-1 space-y-1">
                                            <p className="text-sm text-muted-foreground">视频时长</p>
                                            <p className="font-semibold">{Math.ceil(formData.videoUpload.videoDuration / 60)} 分钟</p>
                                        </div>
                                    </div>
                                    <div className="my-0 grid grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">

                                        <div className="space-y-1">
                                            <p className="text-sm text-muted-foreground">目标语言</p>
                                            <p className="font-semibold">{getLanguageLabel(formData.targetLanguage)}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm text-muted-foreground">视频清晰度</p>
                                            <p className="font-semibold">{getResolutionLabel(formData.resolution)}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm text-muted-foreground">视频水印</p>
                                            <p className="font-semibold">{getWatermarkLabel(formData.watermark)}</p>
                                        </div>
                                    </div>

                                    {formData.videoUpload.content && (
                                        <div className="mt-0 px-4 bg-muted/30 rounded-lg">
                                            <p className="text-sm text-muted-foreground mb-2">视频内容</p>
                                            <p className="text-sm">{formData.videoUpload.content}</p>
                                        </div>
                                    )}

                                    {formData.remark && (
                                        <div className="mt-0 px-4 bg-muted/30 rounded-lg">
                                            <p className="text-sm text-muted-foreground mb-2">视频转换备注</p>
                                            <p className="text-sm">{formData.remark}</p>
                                        </div>
                                    )}

                                    {/* 积分消耗 */}
                                    <div className="p-4 bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg border-2 border-primary/20">
                                        <div className="flex gap-6 items-center justify-between">

                                            <div className="text-right flex-1 text-sm text-muted-foreground">
                                                <p>视频时长: <span className='text-lg text-yellow-600'>{getDurationCredits()} </span>积分</p>
                                                <p className='mt-1'>清晰度: <span className='text-lg text-yellow-600'>{RESOLUTIONS.find(r => r.value === formData.resolution)?.credits} </span>积分</p>
                                                <p className='mt-1'>视频水印: <span className='text-lg text-yellow-600'>{WATERMARK_OPTIONS.find(w => w.value === formData.watermark)?.credits}</span> 积分</p>
                                                <p className='mt-1'>总计消耗: <span className='text-2xl text-red-600'>{calculateCredits()}</span> 积分</p>
                                            </div>
                                            <div className='flex-1'>
                                                {/* <p className="text-sm text-muted-foreground mb-1">剩余积分</p> */}
                                                <div className="flex items-baseline gap-2 justify-center">
                                                    <span className="text-lg text-muted-foreground">剩余</span>
                                                    <span className="text-4xl font-bold text-primary">{user?.credits?.remainingCredits}</span>
                                                    {/* <span className="text-4xl font-bold text-primary">{calculateCredits()}</span> */}
                                                    <span className="text-lg text-muted-foreground">积分</span>
                                                </div>
                                                <div className="flex justify-center items-baseline gap-2">
                                                    {!user?.emailVerified && (<a href="/settings/profile" target="_blank" className="flex items-center text-center flex-col mt-3 space-y-2 text-sm">
                                                        <MailCheck className="text-sm text-blue-600 hover:underline">
                                                            认证
                                                        </MailCheck>
                                                        认证获得更多积分
                                                    </a>)}
                                                    <a href="/pricing" target="_blank" className="flex items-center text-center flex-col mt-3 space-y-2 text-sm">
                                                        <CircleDollarSign className="text-sm text-blue-600 hover:underline">
                                                            充值积分
                                                        </CircleDollarSign>
                                                        按需购买积分使用
                                                    </a>
                                                    <a href="/pricing" target="_blank"  className="flex items-center text-center flex-col mt-3 space-y-2 text-sm">
                                                        <Crown className="text-sm text-blue-600 hover:underline">
                                                            订阅
                                                        </Crown>
                                                        订阅享受跟多权益
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-5 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                        <p className="text-sm text-blue-800 dark:text-blue-200">
                                            💡 提示：转换任务提交后将在后台处理，根据视频大小不同预计需要 3-10 分钟完成。
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                {/* 底部按钮 */}
                <div className="shrink-0 border-t px-6 py-4 bg-muted/30">
                    <div className="flex justify-between">
                        {currentStep === 1 ? (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={handleCancel}
                                >
                                    取消
                                </Button>
                                <Button
                                    onClick={handleStep1Next}
                                    disabled={!formData.videoUpload.title || !formData.videoUpload.videoUrl}
                                >
                                    下一步
                                    <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                            </>
                        ) : currentStep === 2 ? (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={handlePrevious}
                                >
                                    上一步
                                </Button>
                                <Button
                                    onClick={handleStep2Next}
                                    disabled={!formData.resolution || !formData.targetLanguage}
                                >
                                    下一步
                                    <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={handlePrevious}
                                >
                                    上一步
                                </Button>
                                <Button
                                    onClick={handleSubmit}
                                    disabled={submitting}
                                >
                                    {submitting ? "提交中..." : "开始转换"}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
