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
    { value: 'zh-CN', label: '中文' },
    { value: 'en-US', label: '英语' },
    // { value: 'fr-FR', label: '法语' },
    // { value: 'de-DE', label: '德语' },
    // { value: 'ja-JP', label: '日语' },
    // { value: 'ko-KR', label: '韩语' },
    // { value: 'es-ES', label: '西班牙语' },
    // { value: 'pt-PT', label: '葡萄牙语' },
];


// 单人多人
const PEOPLES_OPTIONS = [
    { value: 'single', label: '单人', credits: 0 },
    { value: 'multiple', label: '多人', credits: 0 },
];
interface Config {
    maxFileSizeMB: number;
    pointsPerMinute: number;
    userType: string;
}

interface VideoUploadData {
    videoUrl: string;
    videoKey: string;
    videoSize: number;
    videoDuration: number;
    thumbnailUrl?: string;

    fileName: string;
    fileType: string;
    r2Key: string;
    r2Bucket: string;
}

interface FormData {
    videoUpload: VideoUploadData;
    sourceLanguage: string;// 源语言代码(如:zh-CN)
    targetLanguage: string;// 目标语言代码(如:en-US)
    peoples: string;//说话人数量:single/multiple
}

interface ProjectAddConvertModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreateTaskSuccess?: () => void;
}

const STORAGE_KEY = 'project_add_convert_form_cache';


export function ProjectAddConvertModal({
    isOpen,
    onClose,
    onCreateTaskSuccess,
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
    const [progress2, setProgress2] = useState(0);

    // 表单数据
    const [formData, setFormData] = useState<FormData>({
        videoUpload: {
            videoUrl: '',
            videoKey: '',
            videoSize: 0,
            videoDuration: 0,
            thumbnailUrl: '',

            fileName: '',
            fileType: '',
            r2Key: '',
            r2Bucket: '',
        },
        targetLanguage: 'en-US',// 目标语言代码(如:en-US)
        sourceLanguage: 'zh-CN',// 源语言代码(如:zh-CN)
        peoples: 'single',// 说话人数量:single/multiple
    });
    const [config, setConfig] = useState<Config>({
        maxFileSizeMB: 300 * 1024 * 1024,
        pointsPerMinute: 2,
        userType: 'guest',
    });


    // 从本地存储加载缓存数据
    useEffect(() => {
        const fetchConfig = async () => {
            // 接口获取系统配置
            const res = await fetch("/api/video-task/getconfig");
            const backJO = await res.json();
            console.log("接口获取配置--->", backJO);
            console.log("当前用户--->", user);
            const isGuest = user?.email.startsWith('guest_') && user?.email.endsWith('@temp.local');
            // 默认值
            const tempConfig: Config = {
                userType: isGuest ? 'guest' : 'registered',
                maxFileSizeMB: 300 * 1024 * 1024,
                pointsPerMinute: 2
            };
            for (const item of backJO?.data?.list || []) {
                if (item.configKey === 'limit.guest.file_size_mb' && isGuest) {
                    tempConfig.maxFileSizeMB = parseInt(item.configValue) * 1024 * 1024;
                } else if (item.configKey === 'limit.registered.file_size_mb' && !isGuest) {
                    tempConfig.maxFileSizeMB = parseInt(item.configValue) * 1024 * 1024;
                } else if (item.configKey === "credit.points_per_minute") {
                    tempConfig.pointsPerMinute = parseInt(item.configValue);
                }
            }
            // tempConfig.userType = 'guest'
            // tempConfig.pointsPerMinute = 8;
            setConfig(tempConfig)
            console.log("最终配置--->", tempConfig);
        };

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
            // 接口获取配置
            fetchConfig();
        }
    }, [isOpen]);

    // 计算消耗积分
    const calculateCredits = () => {
        // const resolutionCredits = RESOLUTIONS.find(r => r.value === formData.resolution)?.credits || 0;
        // const watermarkCredits = PEOPLES_OPTIONS.find(w => w.value === formData.peoples)?.credits || 0;
        const durationInMinutes = Math.ceil(formData.videoUpload.videoDuration / 60);
        const durationCredits = durationInMinutes * config.pointsPerMinute; // 1分钟2积分
        return durationCredits;
    };

    // 获取消费后积分
    const getConsumeCredits = () => {
        let sy = user?.credits?.remainingCredits || 0;
        // let sy = 0;
        if (sy <= 0) return 0;
        let jf = sy - calculateCredits();
        return jf;
    }
    const getConsumeTime = () => {
        let jf = user?.credits?.remainingCredits || 0;
        // let jf = 0;
        if (jf <= 0) return 0;
        let duration = Math.floor(jf / 2); // 每分钟2积分
        return duration;
    }

    // 获取时长积分
    // const getDurationCredits = () => {
    //     const durationInMinutes = Math.ceil(formData.videoUpload.videoDuration / 60);
    //     return durationInMinutes * 2; // 1分钟2积分
    // };

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
                videoUrl: '',
                videoKey: '',
                videoSize: 0,
                videoDuration: 0,
                thumbnailUrl: '',

                fileName: '',
                fileType: '',
                r2Key: '',
                r2Bucket: '',
            },
            targetLanguage: 'en-US',// 目标语言代码(如:en-US)
            sourceLanguage: 'zh-CN',// 源语言代码(如:zh-CN)
            peoples: 'single',// 说话人数量:single/multiple
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
        // MP4, MOV, AVI, MKV
        const isMp4 = file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4");
        if (!isMp4) {
            toast.error("仅支持 .mp4 文件");
            resetVideoData(false);
            return;
        }

        // 验证文件大小（500MB）
        const maxSize = config.maxFileSizeMB;
        if (file.size > maxSize) {
            resetVideoData(false);
            toast.error(`视频文件不能超过 ${maxSize}MB`);
            return;
        }

        setProgress2(0);
        setUploading(true);


        // 从本地文件获取视频信息
        const localUrl = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = localUrl;

        await new Promise<void>((resolve) => {
            video.onloadedmetadata = () => {
                const videoDuration = Math.round(video.duration * 10) / 10;
                setFormData(prev => ({
                    ...prev,
                    videoUpload: {
                        ...prev.videoUpload,
                        videoDuration,
                        videoSize: file.size,
                    },
                }));
                console.log('视频时长--->', videoDuration, '秒');
                URL.revokeObjectURL(localUrl);
                resolve();
            };
        });
        

        try {

            const res = await fetch('/api/storage/presigned-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: file.name, contentType: file.type }),
            });

            if (!res.ok) {
                resetVideoData(false);
                throw new Error('Failed to get presigned URL');
            }

            // 获取上传签名url
            const { presignedUrl, key, publicUrl, r2Bucket } = await res.json();

            // 前端直接上传
            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    setProgress2(Math.round((e.loaded / e.total) * 100));
                }
            });

            await new Promise((resolve, reject) => {
                xhr.onload = () => {
                    if (xhr.status === 200) resolve(xhr.response);
                    else reject(new Error(`Upload failed: ${xhr.status}`));
                };
                xhr.onerror = () => reject(new Error('Upload failed'));

                xhr.open('PUT', presignedUrl);
                xhr.setRequestHeader('Content-Type', file.type);
                xhr.send(file);
            });

            //setResult2(`上传成功！\n文件 URL: ${publicUrl}\n\n注意：需要在 R2 Bucket 设置 CORS 规则才能正常工作`);


            const videoUrl = publicUrl;
            const videoKey = key;
            const videoSize = file.size;

            // 创建临时视频元素获取时长
            // const video = document.createElement('video');
            // video.preload = 'metadata';
            // video.src = videoUrl;

            // video.onloadedmetadata = () => {
            //     // const durationInMinutes = Math.ceil(video.duration / 60);
            //     // setVideoDuration(durationInMinutes);
            //     // URL.revokeObjectURL(video.src);
            //     // console.log('视频时长（分钟）:', durationInMinutes);

            //     window.URL.revokeObjectURL(video.src);
            //     const videoDuration = video.duration;// 单位秒
            //     // 保留1位小数
            //     const formattedDuration = Math.round(videoDuration * 10) / 10;
            //     // 更新表单项
            //     setFormData(prev => ({
            //         ...prev,
            //         videoUpload: {
            //             ...prev.videoUpload,
            //             videoDuration: formattedDuration,
            //         },
            //     }));
            //     console.log('视频时长--->', formattedDuration, '秒');
            // };

            // 尝试截取封面（可能失败）
            // video.currentTime = 1; // 截取第1秒的画面
            // video.onseeked = () => {
            //     try {
            //         const canvas = document.createElement('canvas');
            //         canvas.width = video.videoWidth;
            //         canvas.height = video.videoHeight;
            //         const ctx = canvas.getContext('2d');
            //         if (ctx) {
            //             ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            //             const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.8);
            //             setFormData(prev => ({
            //                 ...prev,
            //                 videoUpload: {
            //                     ...prev.videoUpload,
            //                     thumbnailUrl,
            //                 },
            //             }));
            //         }
            //     } catch (error) {
            //         console.log('截取封面失败（忽略）:', error);
            //     }
            // };

            // 更新表单项
            setFormData(prev => ({
                ...prev,
                videoUpload: {
                    ...prev.videoUpload,
                    videoUrl,
                    videoKey,
                    videoSize,

                    fileName: file.name,
                    fileType: file.type,
                    r2Key: key,
                    r2Bucket: r2Bucket, // || 'video-store',
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
                videoUrl: '',
                videoKey: '',
                videoSize: 0,
                videoDuration: 0,
                thumbnailUrl: '',

                fileName: '',
                fileType: '',
                r2Key: '',
                r2Bucket: '',
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

        // {
        //     "userId": "user_123456",
        //     "fileName": "example_video.mp4",
        //     "fileSizeBytes": 104857600,
        //     "fileType": "video/mp4",
        //     "r2Key": "uploads/2025/12/07/abc123def456.mp4",
        //     "r2Bucket": "my-video-bucket",// 桶名称
        //     "videoDurationSeconds": 300,
        //     "checksumSha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        //     "uploadStatus": "completed",
        //     "coverR2Key": "covers/2025/12/07/cover_abc123.jpg",
        //     "coverSizeBytes": 524288,
        //     "coverUpdatedAt": "2025-12-07T10:05:00Z",
        //     "createdBy": "user_123456"
        // }

        // {
        //     "userId": "user_123456",
        //     "originalFileId": "file_id_001",
        //     "sourceLanguage": "zh-CN",
        //     "targetLanguage": "en-US",
        //     "speakerCount": "single",
        //     "status": "pending",
        //     "priority": 3,// 优先级:1=最高,4=最低
        //     "progress": 0,
        //     "currentStep": "upload_complete",
        //     "createdBy": "user_123456"
        // }

        const fd = new FormData();
        fd.append("userId", user?.id || ''); // 用户ID
        fd.append("fileName", "" + formData.videoUpload.fileName); // 
        fd.append("fileSizeBytes", "" + formData.videoUpload.videoSize); // 
        fd.append("fileType", "" + formData.videoUpload.fileType); // 
        fd.append("r2Key", "" + formData.videoUpload.r2Key); // 
        fd.append("r2Bucket", "" + formData.videoUpload.r2Bucket); // 
        fd.append("videoDurationSeconds", "" + formData.videoUpload.videoDuration); // 
        fd.append("credits", "" + calculateCredits()); // 消耗积分
        fd.append("sourceLanguage", formData.sourceLanguage); // 
        fd.append("targetLanguage", formData.targetLanguage); // 
        fd.append("speakerCount", formData.peoples); // 
        fd.append("userType", config.userType); // 'guest' : 'registered'

        // fd.append("prefix", "video-convert"); // 可选：自定义存储前缀
        // fd.append("user_uuid", user?.id || "");
        // fd.append("source_vdo_url", formData.videoUpload.videoUrl); // 视频R2地址
        // fd.append("videoSize", "" + formData.videoUpload.videoSize); // 视频大小
        // fd.append("duration", "" + formData.videoUpload.videoDuration);
        try {
            const res = await fetch("/api/video-task/create", {
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
                // 回调
                onCreateTaskSuccess?.();
                toast.success('转换任务已创建！');

                onClose();
            } else {
                console.error('提交失败:', data);
                toast.error(data?.message || '提交失败，稍后再试！');
            }
        } catch (e) {
            console.error('提交失败--->', e);
            toast.error('提交失败，稍后再试！');
        } finally {
            setSubmitting(false);
        }
    };

    // 获取语言标签
    const getLanguageLabel = (value: string) => {
        return LANGUAGES.find(l => l.value === value)?.label || value;
    };


    // 获取单人双人
    const getWatermarkLabel = (value: string) => {
        return PEOPLES_OPTIONS.find(w => w.value === value)?.label || value;
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="max-w-3xl h-[580px] flex flex-col p-0">
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
                                                <div className="text-center w-full">
                                                    <Upload className="w-6 h-6 mx-auto mb-1 animate-pulse" />
                                                    <span className="text-xs">上传中...</span>
                                                    <div className='mt-2'>
                                                        <div className="h-2 rounded-lg w-[80%] mx-auto bg-[#f0f0f0]">
                                                            <div className="h-2 rounded-lg bg-[#10b981]" style={{ width: `${progress2}%`, transition: 'width 0.3s' }} />
                                                        </div>
                                                        <p className='mt-2'>{progress2}%</p>
                                                    </div>
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
                                        {config.userType === 'guest' ? '访客账号' : '当前账号'}
                                        {`最大支持上传 ${(config?.maxFileSizeMB / 1024 / 1024).toFixed(0)} MB`}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* 第二步：配置参数 */}
                    {currentStep === 2 && (
                        <Card className="mt-2 pt-2 pb-5">
                            <CardContent className="pt-0 space-y-6">
                                {/* 原语言 */}
                                <div className="flex items-center justify-between gap-4 border-b pb-0 my-1">
                                    <div className="flex items-center gap-3 py-4">
                                        {/* <Languages className="w-5 h-5 text-primary" /> */}
                                        <Label htmlFor="sourceLanguage" className="text-base font-medium whitespace-nowrap">
                                            原语言 <span className="text-red-500">*</span>
                                        </Label>
                                    </div>
                                    <Select
                                        value={formData.sourceLanguage}
                                        onValueChange={(value) => setFormData({ ...formData, sourceLanguage: value })}
                                    >
                                        <SelectTrigger id="sourceLanguage" className="flex-1 border-0 shadow-none bg-transparent hover:bg-transparent focus:bg-transparent data-[state=open]:bg-transparent dark:hover:bg-transparent font-medium h-auto py-3 pr-0 pl-4 [&>svg]:hidden [&>span]:ml-auto [&>span]:text-right focus:ring-0 focus:ring-offset-0">
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

                                <div className="flex items-center justify-between gap-4 border-b pb-0 my-1">
                                    <div className="flex items-center gap-3 py-4">
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
                                {/* <div className="flex items-center justify-between gap-3 py-3 mb-4 border-b">
                                    <div className="flex items-center gap-3">
                                        <Label className="text-base font-medium whitespace-nowrap">
                                            原视频时长 <span className="text-red-500">*</span>
                                        </Label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground">
                                            {formData.videoUpload.videoDuration > 0 ? `${Math.ceil(formData.videoUpload.videoDuration / 60)} 分钟` : '加载中...'}
                                        </span>
                                    </div>
                                </div> */}

                                {/* 单人双人 */}
                                <div className="space-y-3 mb-4 mt-2">
                                    <Label className="text-base font-semibold">
                                        {/* <Droplet className="w-5 h-5 text-primary" /> */}
                                        视频中说话人数</Label>
                                    <div className="flex gap-3">
                                        {PEOPLES_OPTIONS.map((option) => (
                                            <button
                                                key={option.value}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, peoples: option.value })}
                                                className={cn(
                                                    "flex-1 px-6 py-2 rounded-lg border-2 transition-all font-medium",
                                                    formData.peoples === option.value
                                                        ? "border-primary bg-primary/10 text-primary"
                                                        : "border-muted-foreground/30 hover:border-primary/50"
                                                )}
                                            >
                                                <div className="text-center">
                                                    <div className="text-sm">{option.label}</div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
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

                                    <div className="my-0 grid grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
                                        <div className="col-span-1 space-y-1">
                                            <p className="text-sm text-muted-foreground text-center">视频时长</p>
                                            <p className="font-semibold text-center">{Math.ceil(formData.videoUpload.videoDuration / 60)}分钟</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm text-muted-foreground text-center">原语言</p>
                                            <p className="font-semibold text-center">{getLanguageLabel(formData.sourceLanguage)}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm text-muted-foreground text-center">目标语言</p>
                                            <p className="font-semibold text-center">{getLanguageLabel(formData.targetLanguage)}</p>
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-sm text-muted-foreground text-center">说话人数</p>
                                            <p className="font-semibold text-center">{getWatermarkLabel(formData.peoples)}</p>
                                        </div>
                                    </div>

                                    {/* 积分消耗 */}
                                    <div className="py-4 px-0 bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg border-2 border-primary/20">
                                        <div className="flex gap-1 items-center justify-between">

                                            <div className="text-right flex-1 text-sm text-muted-foreground">
                                                <p className='mt-1'>消耗积分: <span className='text-2xl text-red-600'>{calculateCredits()}</span> 积分</p>
                                                <p className="mt-2 text-sm text-blue-800 dark:text-blue-200">
                                                    💡 每分钟消耗{config.pointsPerMinute}积分
                                                </p>
                                                {(getConsumeCredits() <= 0) && (<p className="mt-2 text-sm text-blue-800 dark:text-blue-200">
                                                    积分不足，只够处理前{getConsumeTime()}分钟！
                                                </p>)}
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
                                                    {config.userType === 'guest' && (<a href="/settings/profile" target="_blank" className="flex items-center text-center flex-col mt-3 space-y-2 text-sm">
                                                        <MailCheck className="text-sm text-blue-600 hover:underline">
                                                            认证
                                                        </MailCheck>
                                                        注册得更多积分
                                                    </a>)}
                                                    {/* <a href="/pricing" target="_blank" className="flex items-center text-center flex-col mt-3 space-y-2 text-sm">
                                                        <CircleDollarSign className="text-sm text-blue-600 hover:underline">
                                                            充值积分
                                                        </CircleDollarSign>
                                                        注册得更多积分
                                                    </a> */}
                                                    <a href="/pricing" target="_blank" className="flex items-center text-center flex-col mt-3 space-y-2 text-sm">
                                                        <Crown className="text-sm text-blue-600 hover:underline">
                                                            订阅
                                                        </Crown>
                                                        订阅享受多权益
                                                    </a>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-5 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                        <p className="text-sm text-blue-800 dark:text-blue-200">
                                            💡 提示：转换任务根据视频大小不同预计需要 3-10 分钟完成。
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
                                    disabled={!formData.videoUpload.videoUrl}
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
                                    disabled={!formData.targetLanguage}
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
