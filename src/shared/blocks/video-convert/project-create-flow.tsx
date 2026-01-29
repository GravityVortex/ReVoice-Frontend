'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/shared/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Label } from "@/shared/components/ui/label";
import { Button } from "@/shared/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/shared/components/ui/radio-group";
import { useAppContext } from "@/shared/contexts/app";
import { UploadCloud, Clock, Settings2, Zap, Loader2, X, ArrowRight, Languages, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { CostEstimateModal } from './cost-estimate-modal';

type Lang = 'zh' | 'en';

// 单人多人
const PEOPLES_OPTIONS = [
    { value: '1', key: 'single' },
    { value: '2', key: 'multiple' },
];

interface Config {
    maxFileSizeBytes: number;
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
    fileId: string;
}

interface ProjectCreateFormData {
    videoUpload: VideoUploadData;
    sourceLanguage: Lang;
    targetLanguage: Lang;
    peoples: string;
}

const STORAGE_KEY = 'project_add_convert_form_cache';

function getOppositeLanguage(lang: Lang): Lang {
    return lang === 'zh' ? 'en' : 'zh';
}

export function ProjectCreateFlow() {
    const t = useTranslations('video_convert.projectAddConvertModal');
    const router = useRouter();
    const [submitting, setSubmitting] = useState(false);
    const { user } = useAppContext();
    const videoInputRef = useRef<HTMLInputElement>(null);

    // 视频上传状态
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    // Modal state
    const [isCostModalOpen, setIsCostModalOpen] = useState(false);

    // 表单数据
    const [formData, setFormData] = useState<ProjectCreateFormData>({
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
        sourceLanguage: 'zh',
        targetLanguage: 'en',
        peoples: '1',
    });

    const [config, setConfig] = useState<Config>({
        maxFileSizeBytes: 300 * 1024 * 1024,
        pointsPerMinute: 2,
        userType: 'guest',
    });

    const currentBalance = user?.credits?.remainingCredits || 0;

    // Load Config & Cache
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const res = await fetch("/api/video-task/getconfig");
                const backJO = await res.json();
                const isGuest = user?.email.startsWith('guest_') && user?.email.endsWith('@temp.local');

                const tempConfig: Config = {
                    userType: isGuest ? 'guest' : 'registered',
                    maxFileSizeBytes: 300 * 1024 * 1024,
                    pointsPerMinute: 2
                };

                for (const item of backJO?.data?.list || []) {
                    if (item.configKey === 'limit.guest.file_size_mb' && isGuest) {
                        tempConfig.maxFileSizeBytes = parseInt(item.configValue) * 1024 * 1024;
                    } else if (item.configKey === 'limit.registered.file_size_mb' && !isGuest) {
                        tempConfig.maxFileSizeBytes = parseInt(item.configValue) * 1024 * 1024;
                    } else if (item.configKey === "credit.points_per_minute") {
                        tempConfig.pointsPerMinute = parseInt(item.configValue);
                    }
                }
                setConfig(tempConfig)
            } catch (e) {
                console.error("Failed to load config", e);
            }
        };

        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                const sourceLanguage: Lang =
                    parsed?.sourceLanguage === 'en' || parsed?.sourceLanguage === 'zh'
                        ? parsed.sourceLanguage
                        : 'zh';
                setFormData({
                    ...parsed,
                    sourceLanguage,
                    targetLanguage: getOppositeLanguage(sourceLanguage),
                });
            } catch (e) {
                console.error('Failed to parse cache', e);
            }
        }
        fetchConfig();
    }, [user]);

    const durationMinutes = Math.ceil(formData.videoUpload.videoDuration / 60);
    const credits = durationMinutes * config.pointsPerMinute;
    const hasSelectedFile = Boolean(formData.videoUpload.fileName);
    const isInsufficientCredits = credits > 0 && currentBalance < credits;
    const maxSizeLabel = `${(config.maxFileSizeBytes / 1024 / 1024).toFixed(0)}MB`;

    // Cache handling
    useEffect(() => {
        if (formData.videoUpload.videoUrl) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
        }
    }, [formData]);

    const clearCache = () => {
        localStorage.removeItem(STORAGE_KEY);
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
            sourceLanguage: 'zh',
            targetLanguage: 'en',
            peoples: '1',
        });
    };

    // Video Handling
    const handleFile = async (file: File) => {
        if (!file.type.startsWith('video/')) {
            toast.error(t('upload.selectVideo'));
            return;
        }

        const isMp4 = file.type === "video/mp4" || file.name.toLowerCase().endsWith(".mp4");
        if (!isMp4) {
            toast.error(t('upload.onlyMp4'));
            return;
        }

        if (file.size > config.maxFileSizeBytes) {
            toast.error(`${t('upload.maxSizeExceeded')} ${maxSizeLabel}`);
            return;
        }

        setUploading(true);
        setProgress(0);

        try {
            // Get Duration
            const localUrl = URL.createObjectURL(file);
            const videoElement = document.createElement('video');
            videoElement.preload = 'metadata';
            videoElement.src = localUrl;

            await new Promise<void>((resolve, reject) => {
                videoElement.onloadedmetadata = () => {
                    try {
                        const videoDuration = Math.round(videoElement.duration * 10) / 10;
                        setFormData(prev => ({
                            ...prev,
                            videoUpload: {
                                ...prev.videoUpload,
                                videoDuration,
                                videoSize: file.size,
                                fileName: file.name,
                            }
                        }));
                        resolve();
                    } catch (e) {
                        reject(e);
                    } finally {
                        URL.revokeObjectURL(localUrl);
                    }
                };
                videoElement.onerror = () => {
                    URL.revokeObjectURL(localUrl);
                    reject(new Error('Failed to read video metadata'));
                };
            });

            // Upload
            const res = await fetch('/api/storage/presigned-url', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filename: file.name, contentType: file.type }),
            });

            if (!res.ok) throw new Error('Failed to get upload URL');

            const { presignedUrl, key, publicUrl, r2Bucket, fileId } = await res.json();

            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    setProgress(Math.round((e.loaded / e.total) * 100));
                }
            });

            await new Promise((resolve, reject) => {
                xhr.onload = () => xhr.status === 200 ? resolve(xhr.response) : reject(new Error(`Upload failed: ${xhr.status}`));
                xhr.onerror = () => reject(new Error('Network error during upload'));
                xhr.open('PUT', presignedUrl);
                xhr.setRequestHeader('Content-Type', file.type);
                xhr.send(file);
            });

            setFormData(prev => ({
                ...prev,
                videoUpload: {
                    ...prev.videoUpload,
                    videoUrl: publicUrl,
                    videoKey: key,
                    fileType: file.type,
                    r2Key: key,
                    r2Bucket: r2Bucket,
                    fileId: fileId,
                },
            }));
            toast.success(t('upload.uploadSuccess'));
        } catch (error: any) {
            console.error('Upload error:', error);
            toast.error(error.message || t('upload.uploadFailed'));
            clearCache();
            resetFormData();
        } finally {
            setUploading(false);
            if (videoInputRef.current) videoInputRef.current.value = '';
        }
    };

    const handleVideoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        await handleFile(file);
    };

    const handleDrop = async (event: React.DragEvent) => {
        event.preventDefault();
        event.stopPropagation();
        setIsDragging(false);
        if (uploading) return;
        const file = event.dataTransfer.files?.[0];
        if (!file) return;
        await handleFile(file);
    };

    const handleRemoveVideo = () => {
        clearCache();
        resetFormData();
        toast.info(t('upload.videoDeleted'));
    };

    // Submission
    const handleStartClick = () => {
        if (!formData.videoUpload.videoUrl) {
            toast.error(t('messages.uploadVideoRequired'));
            return;
        }
        if (currentBalance < credits) {
            setIsCostModalOpen(true);
            return;
        }
        void handleSubmit();
    };

    const handleSubmit = async () => {
        setIsCostModalOpen(false);
        setSubmitting(true);

        const fd = new FormData();
        fd.append("userId", user?.id || '');
        fd.append("fileName", formData.videoUpload.fileName);
        fd.append("fileSizeBytes", "" + formData.videoUpload.videoSize);
        fd.append("fileType", formData.videoUpload.fileType);
        fd.append("r2Key", formData.videoUpload.r2Key);
        fd.append("r2Bucket", formData.videoUpload.r2Bucket);
        fd.append("videoDurationSeconds", "" + formData.videoUpload.videoDuration);
        fd.append("credits", "" + credits);
        fd.append("sourceLanguage", formData.sourceLanguage);
        fd.append("targetLanguage", formData.targetLanguage);
        fd.append("speakerCount", formData.peoples);
        fd.append("userType", config.userType);
        fd.append("fileId", formData.videoUpload.fileId);

        try {
            const res = await fetch("/api/video-task/create", { method: "POST", body: fd });
            const data = await res.json();

            if (data?.code === 0) {
                clearCache();
                resetFormData();
                toast.success(t('messages.taskCreated'));
                router.push('/dashboard/projects');
            } else {
                toast.error(data?.message || t('messages.submitFailed'));
            }
        } catch (e) {
            toast.error(t('messages.submitFailed'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="mx-auto w-full max-w-6xl flex flex-1 min-h-0 flex-col gap-8">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('title')}</h1>
                <p className="text-muted-foreground text-lg">
                    {t('description')}
                </p>
            </div>

            <div
                className={cn(
                    "grid flex-1 min-h-0 gap-8 items-stretch lg:grid-rows-[minmax(500px,1fr)]",
                    hasSelectedFile ? "lg:grid-cols-2" : "lg:grid-cols-1"
                )}
            >
                {/* Upload */}
                <div className="flex h-full min-h-0 flex-col gap-6">
                    <Card
                        className={cn(
                            "shadow-none min-h-[500px] flex-1 min-h-0 flex flex-col overflow-hidden relative transition-colors p-0 gap-0",
                            !formData.videoUpload.videoUrl
                                ? "border-2 border-dashed border-muted-foreground/20 bg-muted/5"
                                : "border border-border bg-card"
                        )}
                    >
                        <CardContent className="p-0 flex-1 flex flex-col relative w-full h-full">
                            <input
                                ref={videoInputRef}
                                type="file"
                                accept="video/mp4,.mp4"
                                onChange={handleVideoSelect}
                                className="hidden"
                            />

                            {!formData.videoUpload.videoUrl ? (
                                <button
                                    onClick={() => videoInputRef.current?.click()}
                                    disabled={uploading}
                                    type="button"
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (!uploading) setIsDragging(true);
                                    }}
                                    onDragLeave={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setIsDragging(false);
                                    }}
                                    onDrop={handleDrop}
                                    className={cn(
                                        "flex-1 w-full flex flex-col items-center justify-center p-12 transition-colors hover:bg-muted/30 cursor-pointer text-center",
                                        isDragging && "bg-muted/40",
                                        uploading && "cursor-not-allowed opacity-80"
                                    )}
                                >
                                    {uploading ? (
                                        <div className="flex flex-col items-center gap-4">
                                            <Loader2 className="h-12 w-12 animate-spin text-primary" />
                                            <div className="space-y-1">
                                                <p className="text-lg font-medium text-foreground">{t('upload.uploading')}</p>
                                                <p className="text-sm text-muted-foreground font-mono">{progress}%</p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                                                <UploadCloud className="h-8 w-8 text-primary" />
                                            </div>
                                            <div className="space-y-1">
                                                <h3 className="text-xl font-semibold text-foreground">{t('steps.uploadVideo')}</h3>
                                                <p className="text-sm text-muted-foreground">{t('upload.onlyMp4')}</p>
                                            </div>
                                            <div className="mt-4 px-3 py-1 bg-muted rounded-full text-xs font-medium text-muted-foreground">
                                                {t('upload.maxSize')}: {maxSizeLabel}
                                            </div>
                                        </div>
                                    )}
                                </button>
                            ) : (
                                <div className="relative w-full flex-1 bg-black/50 overflow-hidden group flex items-center justify-center">
                                    <div className="absolute inset-0 bg-grid-white/[0.02]" />
                                    <video
                                        src={formData.videoUpload.videoUrl}
                                        controls
                                        className="w-full h-full max-h-full object-contain relative z-10"
                                    />
                                    <Button
                                        size="icon"
                                        variant="secondary"
                                        className="absolute top-4 right-4 h-8 w-8 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-20"
                                        onClick={handleRemoveVideo}
                                    >
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </CardContent>

                        {/* File Stats Footer */}
                        {formData.videoUpload.videoUrl && (
                            <div className="border-t bg-card p-4 grid grid-cols-2 divide-x">
                                <div className="px-4 flex flex-col gap-1">
                                    <span className="text-xs uppercase text-muted-foreground font-semibold flex items-center gap-1">
                                        <Clock className="h-3 w-3" /> {t('upload.duration')}
                                    </span>
                                    <span className="text-sm font-medium">
                                        {Math.ceil(formData.videoUpload.videoDuration / 60)} min
                                    </span>
                                </div>
                                <div className="px-4 flex flex-col gap-1">
                                    <span className="text-xs uppercase text-muted-foreground font-semibold flex items-center gap-1">
                                        <Settings2 className="h-3 w-3" /> {t('upload.fileSize')}
                                    </span>
                                    <span className="text-sm font-medium">
                                        {(formData.videoUpload.videoSize / 1024 / 1024).toFixed(1)} MB
                                    </span>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>

                {hasSelectedFile && (
                    <div className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto pr-2">
                        <Card className="flex-auto">
                            <CardHeader>
                                <CardTitle className="text-base uppercase tracking-widest text-muted-foreground font-semibold flex items-center gap-2">
                                    <Settings2 className="h-4 w-4" /> {t('steps.configParams')}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-3">
                                    <Label className="text-sm font-medium">{t('config.sourceLanguage')}</Label>
                                    <RadioGroup
                                        value={formData.sourceLanguage}
                                        onValueChange={(v) => {
                                            const sourceLanguage = (v === 'en' || v === 'zh' ? v : 'zh') as Lang;
                                            setFormData(prev => ({
                                                ...prev,
                                                sourceLanguage,
                                                targetLanguage: getOppositeLanguage(sourceLanguage),
                                            }));
                                        }}
                                        className="grid grid-cols-2 gap-4"
                                    >
                                        {(['zh', 'en'] as const).map((lang) => (
                                            <div key={lang}>
                                                <RadioGroupItem value={lang} id={`lang-${lang}`} className="peer sr-only" />
                                                <Label
                                                    htmlFor={`lang-${lang}`}
                                                    className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-transparent p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-all"
                                                >
                                                    <Languages className="mb-1 h-5 w-5 text-muted-foreground peer-data-[state=checked]:text-primary" />
                                                    <span className="font-semibold">
                                                        {t(`languages.${lang}`)} → {t(`languages.${getOppositeLanguage(lang)}`)}
                                                    </span>
                                                </Label>
                                            </div>
                                        ))}
                                    </RadioGroup>
                                </div>

                                <details
                                    className="rounded-md border bg-muted/30"
                                >
                                    <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-muted-foreground">
                                        {t('ui.advanced')}
                                    </summary>
                                    <div className="px-4 pb-4 pt-2 space-y-3">
                                        <Label className="text-sm font-medium">{t('config.speakerCount')}</Label>
                                        <RadioGroup
                                            value={formData.peoples}
                                            onValueChange={(v) => setFormData(prev => ({ ...prev, peoples: v }))}
                                            className="grid grid-cols-2 gap-4"
                                        >
                                            {PEOPLES_OPTIONS.map((option) => (
                                                <div key={option.value}>
                                                    <RadioGroupItem value={option.value} id={`spk-${option.value}`} className="peer sr-only" />
                                                    <Label
                                                        htmlFor={`spk-${option.value}`}
                                                        className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-all"
                                                    >
                                                        <Users className="mb-2 h-6 w-6 text-muted-foreground peer-data-[state=checked]:text-primary" />
                                                        <span className="font-semibold">{t(`speakers.${option.key}`)}</span>
                                                    </Label>
                                                </div>
                                            ))}
                                        </RadioGroup>
                                        <p className="text-xs text-muted-foreground">{t('ui.speakerHint')}</p>
                                    </div>
                                </details>
                            </CardContent>
                        </Card>

                        {/* Cost & Action */}
                        <Card className="shrink-0 bg-primary/5 border-primary/20">
                            <CardContent className="p-6 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <span className="text-xs font-semibold uppercase text-primary/80">{t('confirm.consumeCredits')}</span>
                                        <div className="flex items-baseline gap-1">
                                            <span className="text-3xl font-bold text-primary">{credits}</span>
                                            <span className="text-sm text-muted-foreground">{t('confirm.credits')}</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {t('confirm.creditsPerMinute', { points: config.pointsPerMinute })}
                                        </p>
                                    </div>
                                    <Zap className={cn("h-8 w-8", isInsufficientCredits ? "text-red-500/40" : "text-primary/20")} />
                                </div>

                                <Button
                                    className="w-full text-lg h-12"
                                    size="lg"
                                    onClick={handleStartClick}
                                    disabled={submitting || uploading || !formData.videoUpload.videoUrl || !user?.id || !user?.credits}
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> {t('buttons.submitting')}
                                        </>
                                    ) : (
                                        <>
                                            {t('buttons.startConvert')} <ArrowRight className="ml-2 h-5 w-5" />
                                        </>
                                    )}
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                )}
            </div>

            <CostEstimateModal
                isOpen={isCostModalOpen}
                onClose={() => setIsCostModalOpen(false)}
                onConfirm={handleSubmit}
                cost={credits}
                durationMinutes={durationMinutes}
                pointsPerMinute={config.pointsPerMinute}
                isGuest={config.userType === 'guest'}
                sourceLanguage={formData.sourceLanguage}
                targetLanguage={formData.targetLanguage}
                speakerCount={formData.peoples}
            />
        </div>
    );
}
