'use client';

import { useEffect, useState, useRef } from 'react';
import { useTranslations } from 'next-intl';
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
import { Check, ChevronRight, ArrowLeftRight, ArrowRight, Languages, Clock, Video, Droplet, BookText, Plus, Trash2, Upload, Link, BadgeDollarSign, Crown, CircleDollarSign, CreditCard, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { usePausedVideoPrefetch } from '@/shared/hooks/use-paused-video-prefetch';
import { SUPPORTED_LANGUAGES, getDefaultTargetLang, isValidLangCode } from '@/shared/lib/languages';
import { LangBadge } from '@/shared/components/ui/lang-badge';

// 单人多人
const PEOPLES_OPTIONS = [
    { value: '1', key: 'single', credits: 0 },
    { value: '2', key: 'multiple', credits: 0 },
];
interface Config {
    maxFileSizeMB: number;
    pointsPerMinute: number;
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
    fileId: string;
}

interface FormData {
    videoUpload: VideoUploadData;
    sourceLanguage: string;// 源语言代码(如:zh)
    targetLanguage: string;// 目标语言代码(如:en)
    peoples: string;//说话人数量:1:single/2:multiple
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
    const t = useTranslations('video_convert.projectAddConvertModal');
    const [currentStep, setCurrentStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const { user, fetchUserCredits } = useAppContext();
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
            fileId: '',
        },
        targetLanguage: 'en',// 目标语言代码(如:en)
        sourceLanguage: 'zh',// 源语言代码(如:zh)
        peoples: '1',// 说话人数量:1:single/2:multiple
    });
    const [config, setConfig] = useState<Config>({
        maxFileSizeMB: 300 * 1024 * 1024,
        pointsPerMinute: 3,
    });
    usePausedVideoPrefetch(videoRef, {
        enabled: isOpen && Boolean(formData.videoUpload.videoUrl),
        minBufferedAheadSeconds: 10,
    });


    // 从本地存储加载缓存数据
    useEffect(() => {
        const fetchConfig = async () => {
            // 接口获取系统配置
            const res = await fetch("/api/video-task/getconfig");
            const backJO = await res.json();
            console.log("接口获取配置--->", backJO);
            console.log("当前用户--->", user);
            // 默认值（guest 已移除，只保留注册/订阅用户）
            const tempConfig: Config = {
                maxFileSizeMB: 300 * 1024 * 1024,
                pointsPerMinute: 3,
            };
            for (const item of backJO?.data?.list || []) {
                if (item.configKey === 'limit.registered.file_size_mb') {
                    tempConfig.maxFileSizeMB = parseInt(item.configValue) * 1024 * 1024;
                } else if (item.configKey === "credit.points_per_minute") {
                    tempConfig.pointsPerMinute = parseInt(item.configValue);
                }
            }
            // tempConfig.pointsPerMinute = 8;
            setConfig(tempConfig)
            console.log("最终配置--->", tempConfig);
        };

        if (isOpen) {
            const cached = sessionStorage.getItem(STORAGE_KEY);
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
        const durationCredits = durationInMinutes * config.pointsPerMinute; // duration (minutes) * pointsPerMinute
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
        const ppm = Number.isFinite(config.pointsPerMinute) && config.pointsPerMinute > 0 ? config.pointsPerMinute : 3;
        let duration = Math.floor(jf / ppm);
        return duration;
    }

    const currentBalance = user?.credits?.remainingCredits || 0;
    const creditsNeeded = calculateCredits();
    const isInsufficientCredits = creditsNeeded > 0 && currentBalance < creditsNeeded;
    const shortBy = Math.max(0, creditsNeeded - currentBalance);

    useEffect(() => {
        if (currentStep === 3) fetchUserCredits();
    }, [currentStep, fetchUserCredits]);

    // 保存到本地缓存
    const saveToCache = () => {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
        // localStorage.setItem(`${STORAGE_KEY}_duration`, videoDuration.toString());
        console.log('表单数据已缓存');
    };

    // 清除缓存
    const clearCache = () => {
        sessionStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(`${STORAGE_KEY}_duration`);
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
                fileId: '',
            },
            targetLanguage: 'en',// 目标语言代码(如:en)
            sourceLanguage: 'zh',// 源语言代码(如:zh)
            peoples: '1',// 说话人数量:1:single/2:multiple
        });
    };

    // 处理视频文件选择
    const handleVideoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        console.log('>>> handleVideoSelect TRIGGERED - V2 Multipart <<<');
        const file = event.target.files?.[0];
        if (!file) {
            resetVideoData(false);
            return;
        }

        // 验证文件类型
        if (!file.type.startsWith('video/')) {
            toast.error(t('upload.selectVideo'));
            resetVideoData(false);
            return;
        }

        // 类型与后缀双重判断
        // MP4, MOV, AVI, MKV
        const isMp4 = file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4");
        if (!isMp4) {
            toast.error(t('upload.onlyMp4'));
            resetVideoData(false);
            return;
        }

        // 验证文件大小（500MB）
        const maxSize = config.maxFileSizeMB;
        if (file.size > maxSize) {
            resetVideoData(false);
            toast.error(`${t('upload.maxSizeExceeded')} ${maxSize}MB`);
            return;
        }

        setProgress2(0);
        setUploading(true);


        // 从本地文件获取视频信息
        const localUrl = URL.createObjectURL(file);
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.src = localUrl;

        const MAX_VIDEO_DURATION_SECONDS = 3600;
        const durationOk = await new Promise<boolean>((resolve) => {
            video.onloadedmetadata = () => {
                const videoDuration = Math.round(video.duration * 10) / 10;
                URL.revokeObjectURL(localUrl);

                if (videoDuration > MAX_VIDEO_DURATION_SECONDS) {
                    toast.error(t('upload.durationExceeded'));
                    resetVideoData(false);
                    setUploading(false);
                    resolve(false);
                    return;
                }

                setFormData(prev => ({
                    ...prev,
                    videoUpload: {
                        ...prev.videoUpload,
                        videoDuration,
                        videoSize: file.size,
                    },
                }));
                console.log('视频时长--->', videoDuration, '秒');
                resolve(true);
            };
        });

        if (!durationOk) return;


        try {
            // 使用分片上传（Multipart Upload）
            // - 默认配置见 MultipartUploader（分片+并发+重试）
            const { MultipartUploader } = await import('@/shared/lib/multipart-upload');
            const uploader = new MultipartUploader();

            const result = await uploader.upload(file, {
                onProgress: (progress) => {
                    setProgress2(progress);
                },
                onStatus: (status) => {
                    console.log('[Multipart Upload]', status);
                },
            });

            const videoUrl = result.publicUrl;
            const videoKey = result.key;
            const videoSize = file.size;

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
                    r2Key: result.keyV,
                    r2Bucket: result.bucket,
                    fileId: result.fileId,
                },
            }));
            toast.success(t('upload.uploadSuccess'));
        } catch (error: any) {
            console.error('视频上传失败:', error);
            toast.error(error?.message || t('upload.uploadFailed'));
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
                fileId: '',
            },
        }));
        showTip && toast.success(t('upload.videoDeleted'));
    };

    // 处理取消
    const handleCancel = () => {
        saveToCache();
        onClose();
    };

    // 处理第一步的下一步
    const handleStep1Next = () => {
        if (!formData.videoUpload.videoUrl) {
            toast.error(t('messages.uploadVideoRequired'));
            return;
        }
        saveToCache();
        setCurrentStep(2);
    };

    // 处理第二步的下一步
    const handleStep2Next = () => {
        if (!formData.targetLanguage) {
            toast.error(t('messages.targetLanguageRequired'));
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
        //     "sourceLanguage": "zh",
        //     "targetLanguage": "en",
        //     "speakerCount": "1",
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
        fd.append("fileId", formData.videoUpload.fileId); // 文件Id

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
                toast.success(t('messages.taskCreated'));

                onClose();
            } else {
                console.error('提交失败:', data);
                const msg = data?.message || t('messages.submitFailed');
                const isCreditsError = msg.includes('积分不足') || msg.toLowerCase().includes('insufficient credit');
                if (isCreditsError) {
                    fetchUserCredits();
                    toast.error(msg, { action: { label: t('confirm.buyCredits'), onClick: () => window.open('/pricing', '_blank') } });
                } else {
                    toast.error(msg);
                }
            }
        } catch (e) {
            console.error('提交失败--->', e);
            toast.error(t('messages.submitFailed'));
        } finally {
            setSubmitting(false);
        }
    };

    const getLanguageLabel = (value: string) => {
        const lang = SUPPORTED_LANGUAGES.find(l => l.code === value);
        return lang ? t(`languages.${lang.code}`) : value;
    };

    // 获取单人双人
    const getWatermarkLabel = (value: string) => {
        const option = PEOPLES_OPTIONS.find(w => w.value === value);
        return option ? t(`speakers.${option.key}`) : value;
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="min-w-[700px] h-[680px] flex flex-col p-0">
                <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription className="sr-only">
                        {t('description')}
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
                                {t('steps.uploadVideo')}
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
                                {t('steps.configParams')}
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
                                {t('steps.confirmConvert')}
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
                                        {t('upload.videoFile')} <span className="text-red-500">*</span>
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
                                                    <span className="text-xs">{t('upload.uploading')}</span>
                                                    <div className='mt-2'>
                                                        <div className="h-2 rounded-lg w-[80%] mx-auto bg-muted">
                                                            <div className="h-2 rounded-lg bg-primary" style={{ width: `${progress2}%`, transition: 'width 0.3s' }} />
                                                        </div>
                                                        <p className='mt-2'>{progress2}%</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                <Plus className="w-8 h-8 text-muted-foreground" />
                                            )}
                                        </button>
                                    ) : (
                                        <div className="relative inline-block w-full">
                                            <video
                                                ref={videoRef}
                                                src={formData.videoUpload.videoUrl}
                                                controls
                                                preload="auto"
                                                className="w-full object-cover aspect-video h-auto rounded-lg border"
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
                                                {t('upload.fileSize')}: {(formData.videoUpload.videoSize / 1024 / 1024).toFixed(2)} MB
                                                {formData.videoUpload.videoDuration > 0 && ` | ${t('upload.duration')}: ${Math.ceil(formData.videoUpload.videoDuration / 60)} 分钟`}
                                            </div>
                                        </div>
                                    )}
                                    <p className="text-xs text-muted-foreground mt-1">
                                        {t('upload.currentAccount')}
                                        {`${t('upload.maxSize')} ${(config?.maxFileSizeMB / 1024 / 1024).toFixed(0)} MB`}
                                        {` · ${t('upload.maxDuration')} 1h`}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* 第二步：配置参数 */}
                    {currentStep === 2 && (
                        <Card className="mt-2 pt-2 pb-5">
                            <CardContent className="pt-0 space-y-8">
                                <div className="space-y-3">
                                    <Label className="text-base font-semibold">{t('config.sourceLanguage')}</Label>
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 space-y-1.5">
                                            <span className="text-muted-foreground text-xs font-medium">{t('config.sourceLanguage')}</span>
                                            <Select
                                                value={formData.sourceLanguage}
                                                onValueChange={(value) => {
                                                    if (!isValidLangCode(value)) return;
                                                    setFormData(prev => ({
                                                        ...prev,
                                                        sourceLanguage: value,
                                                        targetLanguage: prev.targetLanguage === value ? getDefaultTargetLang(value) : prev.targetLanguage,
                                                    }));
                                                }}
                                            >
                                                <SelectTrigger className="h-12 w-full text-base">
                                                    <SelectValue placeholder={t('config.selectLanguage')} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {SUPPORTED_LANGUAGES.map((lang) => (
                                                        <SelectItem key={lang.code} value={lang.code} className="py-2.5 text-base">
                                                            <LangBadge code={lang.code} size="sm" className="mr-2" />
                                                            <span className="font-medium">{t(`languages.${lang.code}`)}</span>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="icon"
                                            className="mt-5 h-10 w-10 shrink-0 rounded-full"
                                            title={t('config.swap')}
                                            onClick={() => {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    sourceLanguage: prev.targetLanguage,
                                                    targetLanguage: prev.sourceLanguage,
                                                }));
                                            }}
                                        >
                                            <ArrowLeftRight className="h-5 w-5" />
                                        </Button>

                                        <div className="flex-1 space-y-1.5">
                                            <span className="text-muted-foreground text-xs font-medium">{t('config.targetLanguage')}</span>
                                            <Select
                                                value={formData.targetLanguage}
                                                onValueChange={(value) => {
                                                    if (!isValidLangCode(value)) return;
                                                    setFormData(prev => ({ ...prev, targetLanguage: value }));
                                                }}
                                            >
                                                <SelectTrigger className="h-12 w-full text-base">
                                                    <SelectValue placeholder={t('config.selectLanguage')} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {SUPPORTED_LANGUAGES.filter((l) => l.code !== formData.sourceLanguage).map((lang) => (
                                                        <SelectItem key={lang.code} value={lang.code} className="py-2.5 text-base">
                                                            <LangBadge code={lang.code} size="sm" className="mr-2" />
                                                            <span className="font-medium">{t(`languages.${lang.code}`)}</span>
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
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
                                <div className="space-y-3 mb-4 mt-10 h-40">
                                    <Label className="text-base font-semibold">
                                        {/* <Droplet className="w-5 h-5 text-primary" /> */}
                                        {t('config.speakerCount')}</Label>
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
                                                    <div className="text-sm">{t(`speakers.${option.key}`)}</div>
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
                        <Card className="mt-2 pt-2 pb-8">
                            <CardContent className="pt-0 space-y-6">
                                <div className="space-y-4">
                                    {/* <h3 className="mb-0 text-lg font-semibold text-primary">视频转换配置确认</h3> */}

                                    {/* Language pair */}
                                    <div className="my-5 flex items-center justify-center gap-5 p-5 bg-muted/30 rounded-lg">
                                        <div className="flex flex-col items-center text-center">
                                            <LangBadge code={formData.sourceLanguage} size="lg" />
                                            <p className="mt-1 text-base font-bold">{t(`languages.${formData.sourceLanguage}`)}</p>
                                        </div>
                                        <ArrowRight className="h-6 w-6 text-muted-foreground shrink-0" />
                                        <div className="flex flex-col items-center text-center">
                                            <LangBadge code={formData.targetLanguage} size="lg" />
                                            <p className="mt-1 text-base font-bold">{t(`languages.${formData.targetLanguage}`)}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-3 gap-4 p-4 bg-muted/30 rounded-lg">
                                        <div className="space-y-1 text-center">
                                            <p className="text-xs text-muted-foreground">{t('confirm.videoDuration')}</p>
                                            <p className="text-sm font-semibold">{Math.ceil(formData.videoUpload.videoDuration / 60)} {t('ui.minutes')}</p>
                                        </div>
                                        <div className="space-y-1 text-center">
                                            <p className="text-xs text-muted-foreground">{t('confirm.speakerCount')}</p>
                                            <p className="text-sm font-semibold">{getWatermarkLabel(formData.peoples)}</p>
                                        </div>
                                        <div className="space-y-1 text-center">
                                            <p className="text-xs text-muted-foreground">{t('confirm.consumeCredits')}</p>
                                            <p className="text-sm font-semibold">{calculateCredits()} {t('confirm.credits')}</p>
                                        </div>
                                    </div>

                                    {/* 积分消耗 */}
                                    <div className={cn(
                                        "py-6 px-4 rounded-lg border transition-colors",
                                        isInsufficientCredits
                                            ? "bg-destructive/5 border-destructive/20"
                                            : "bg-muted/30 border-border"
                                    )}>
                                        <div className="flex gap-4 items-start justify-between">
                                            <div className="flex-1 text-sm text-muted-foreground">
                                                <p>{t('confirm.consumeCredits')}: <span className='text-2xl font-bold text-foreground'>{creditsNeeded}</span> {t('confirm.credits')}</p>
                                                <p className="mt-2 text-xs text-muted-foreground">
                                                    {t('confirm.creditsPerMinute', { points: config.pointsPerMinute })}
                                                </p>
                                            </div>
                                            <div className='flex-1 text-right'>
                                                <p className="text-xs text-muted-foreground">{t('confirm.currentBalance')}</p>
                                                <p className={cn("text-3xl font-bold", isInsufficientCredits ? "text-destructive" : "text-primary")}>
                                                    {currentBalance}
                                                </p>
                                                <p className="text-xs text-muted-foreground">{t('confirm.credits')}</p>
                                            </div>
                                        </div>
                                        {isInsufficientCredits && (
                                            <div className="mt-4 rounded-lg bg-destructive/10 border border-destructive/20 p-3 space-y-2">
                                                <p className="text-sm font-medium text-destructive flex items-center gap-1.5">
                                                    <AlertTriangle className="h-4 w-4 shrink-0" />
                                                    {t('confirm.shortBy', { amount: shortBy })}
                                                </p>
                                                <p className="text-xs text-muted-foreground">{t('confirm.buyCreditsHint')}</p>
                                                <Button
                                                    variant="default"
                                                    size="sm"
                                                    className="w-full"
                                                    type="button"
                                                    onClick={() => window.open('/pricing', '_blank')}
                                                >
                                                    <CreditCard className="mr-2 h-4 w-4" />
                                                    {t('confirm.buyCredits')}
                                                </Button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="mt-8 p-4 bg-muted/50 rounded-lg border border-border">
                                        <p className="text-sm text-muted-foreground">
                                            {t('confirm.estimatedTime')}
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
                                    {t('buttons.cancel')}
                                </Button>
                                <Button
                                    onClick={handleStep1Next}
                                    disabled={!formData.videoUpload.videoUrl}
                                >
                                    {t('buttons.next')}
                                    <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                            </>
                        ) : currentStep === 2 ? (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={handlePrevious}
                                >
                                    {t('buttons.previous')}
                                </Button>
                                <Button
                                    onClick={handleStep2Next}
                                    disabled={!formData.targetLanguage}
                                >
                                    {t('buttons.next')}
                                    <ChevronRight className="w-4 h-4 ml-1" />
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={handlePrevious}
                                >
                                    {t('buttons.previous')}
                                </Button>
                                <Button
                                    onClick={handleSubmit}
                                    disabled={submitting || isInsufficientCredits}
                                >
                                    {submitting ? t('buttons.submitting') : t('buttons.startConvert')}
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
