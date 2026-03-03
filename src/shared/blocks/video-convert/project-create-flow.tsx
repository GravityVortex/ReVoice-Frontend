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
import { useRouter } from '@/core/i18n/navigation';
import { CostEstimateModal } from './cost-estimate-modal';
import { usePausedVideoPrefetch } from '@/shared/hooks/use-paused-video-prefetch';

type Lang = 'zh' | 'en';
type PreviewSource = 'local' | 'cloud';

// 弱触发：播放中卡顿超过阈值（ms）自动切云端
const PREVIEW_STALL_THRESHOLD_MS = 5000;
const PREVIEW_STALL_EPSILON_SECONDS = 0.1;

// 单人多人
const PEOPLES_OPTIONS = [
    { value: '1', key: 'single' },
    { value: '2', key: 'multiple' },
];

interface Config {
    maxFileSizeBytes: number;
    pointsPerMinute: number;
}

interface VideoUploadData {
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
    const previewVideoRef = useRef<HTMLVideoElement>(null);

    const [localPreviewUrl, setLocalPreviewUrl] = useState('');
    const localPreviewUrlRef = useRef('');

    const [previewSource, setPreviewSource] = useState<PreviewSource>('local');
    const previewSourceRef = useRef<PreviewSource>('local');
    const didAutoSwitchToCloudRef = useRef(false);
    const pendingPlaybackRestoreRef = useRef<{
        time: number;
        paused: boolean;
        playbackRate: number;
    } | null>(null);
    const stallTimerRef = useRef<number | null>(null);

    const uploaderRef = useRef<{ abort?: () => void } | null>(null);
    const uploadSessionIdRef = useRef(0);

    // 视频上传状态
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    // Modal state
    const [isCostModalOpen, setIsCostModalOpen] = useState(false);

    // 表单数据
    const [formData, setFormData] = useState<ProjectCreateFormData>({
        videoUpload: {
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
        pointsPerMinute: 3,
    });

    const isUploadComplete = Boolean(
        formData.videoUpload.fileId &&
        formData.videoUpload.videoKey &&
        formData.videoUpload.r2Key &&
        formData.videoUpload.r2Bucket
    );
    const cloudPreviewUrl = isUploadComplete
        ? `/api/storage/stream?key=${encodeURIComponent(formData.videoUpload.videoKey)}`
        : '';
    const activePreviewUrl = previewSource === 'cloud' && cloudPreviewUrl ? cloudPreviewUrl : localPreviewUrl;
    const hasPreview = Boolean(activePreviewUrl);

    const currentBalance = user?.credits?.remainingCredits || 0;
    usePausedVideoPrefetch(previewVideoRef, {
        enabled: previewSource === 'cloud' && Boolean(cloudPreviewUrl),
        minBufferedAheadSeconds: 10,
    });

    useEffect(() => {
        previewSourceRef.current = previewSource;
    }, [previewSource]);

    const clearStallTimer = () => {
        if (stallTimerRef.current == null) return;
        window.clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
    };

    const abortUploadAndInvalidateSession = () => {
        uploadSessionIdRef.current += 1;
        try {
            uploaderRef.current?.abort?.();
        } catch {
            // ignore
        }
        uploaderRef.current = null;
    };

    const revokeLocalPreviewUrl = () => {
        const prev = localPreviewUrlRef.current;
        localPreviewUrlRef.current = '';
        if (!prev) return;
        try {
            URL.revokeObjectURL(prev);
        } catch {
            // ignore
        }
    };

    const setNewLocalPreviewUrl = (url: string) => {
        if (localPreviewUrlRef.current && localPreviewUrlRef.current !== url) {
            revokeLocalPreviewUrl();
        }
        localPreviewUrlRef.current = url;
        setLocalPreviewUrl(url);
    };

    const resetPreviewState = () => {
        clearStallTimer();
        pendingPlaybackRestoreRef.current = null;
        didAutoSwitchToCloudRef.current = false;
        previewSourceRef.current = 'local';
        setPreviewSource('local');
        revokeLocalPreviewUrl();
        setLocalPreviewUrl('');
    };

    const switchToCloudPreview = (reason: 'error' | 'stall') => {
        if (previewSourceRef.current === 'cloud') return;
        if (!isUploadComplete) return;
        if (didAutoSwitchToCloudRef.current) return;

        didAutoSwitchToCloudRef.current = true;
        clearStallTimer();

        const video = previewVideoRef.current;
        if (video) {
            pendingPlaybackRestoreRef.current = {
                time: Number.isFinite(video.currentTime) ? video.currentTime : 0,
                paused: video.paused,
                playbackRate: Number.isFinite(video.playbackRate) ? video.playbackRate : 1,
            };
        }

        console.warn('[CreatePreview] switch to cloud preview:', reason);
        previewSourceRef.current = 'cloud';
        setPreviewSource('cloud');
    };

    const armStallSwitchIfNeeded = () => {
        clearStallTimer();
        if (previewSourceRef.current !== 'local') return;
        if (!isUploadComplete) return;
        if (didAutoSwitchToCloudRef.current) return;

        const video = previewVideoRef.current;
        if (!video) return;
        // playing 态 + 非 seeking 才触发弱兜底。
        if (video.paused || video.seeking || video.ended) return;

        const anchorTime = Number.isFinite(video.currentTime) ? video.currentTime : 0;
        stallTimerRef.current = window.setTimeout(() => {
            stallTimerRef.current = null;

            const v = previewVideoRef.current;
            if (!v) return;
            if (previewSourceRef.current !== 'local') return;
            if (!isUploadComplete) return;
            if (didAutoSwitchToCloudRef.current) return;
            if (v.paused || v.seeking || v.ended) return;

            const nowTime = Number.isFinite(v.currentTime) ? v.currentTime : 0;
            if (Math.abs(nowTime - anchorTime) > PREVIEW_STALL_EPSILON_SECONDS) return;

            switchToCloudPreview('stall');
        }, PREVIEW_STALL_THRESHOLD_MS);
    };

    useEffect(() => {
        return () => {
            abortUploadAndInvalidateSession();
            clearStallTimer();
            revokeLocalPreviewUrl();
        };
    }, []);

    // Load Config & Cache
    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const res = await fetch("/api/video-task/getconfig");
                const backJO = await res.json();

                const tempConfig: Config = {
                    maxFileSizeBytes: 300 * 1024 * 1024,
                    pointsPerMinute: 3
                };

                for (const item of backJO?.data?.list || []) {
                    if (item.configKey === 'limit.registered.file_size_mb') {
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
                const rawUpload = parsed?.videoUpload || {};
                const normalizedUpload: VideoUploadData = {
                    videoKey: String(rawUpload.videoKey || ''),
                    videoSize: Number(rawUpload.videoSize || 0),
                    videoDuration: Number(rawUpload.videoDuration || 0),
                    // 不缓存 URL，这里仅做兜底兼容（历史缓存/数据结构变化）。
                    thumbnailUrl: '',
                    fileName: String(rawUpload.fileName || ''),
                    fileType: String(rawUpload.fileType || ''),
                    r2Key: String(rawUpload.r2Key || ''),
                    r2Bucket: String(rawUpload.r2Bucket || ''),
                    fileId: String(rawUpload.fileId || ''),
                };
                const sourceLanguage: Lang =
                    parsed?.sourceLanguage === 'en' || parsed?.sourceLanguage === 'zh'
                        ? parsed.sourceLanguage
                        : 'zh';
                setFormData({
                    ...parsed,
                    videoUpload: normalizedUpload,
                    sourceLanguage,
                    targetLanguage: getOppositeLanguage(sourceLanguage),
                });

                // 刷新后本地文件不可恢复：若已完成上传，默认展示云端预览（同源 stream）。
                if (normalizedUpload.fileId && normalizedUpload.videoKey) {
                    didAutoSwitchToCloudRef.current = true;
                    setPreviewSource('cloud');
                }
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
        if (!isUploadComplete) return;

        // 只缓存稳定字段：不缓存任何 URL（包含 blob: 与 presigned）。
        const stableCache: ProjectCreateFormData = {
            ...formData,
            videoUpload: {
                videoKey: formData.videoUpload.videoKey,
                videoSize: formData.videoUpload.videoSize,
                videoDuration: formData.videoUpload.videoDuration,
                fileName: formData.videoUpload.fileName,
                fileType: formData.videoUpload.fileType,
                r2Key: formData.videoUpload.r2Key,
                r2Bucket: formData.videoUpload.r2Bucket,
                fileId: formData.videoUpload.fileId,
            },
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stableCache));
    }, [formData, isUploadComplete]);

    const clearCache = () => {
        localStorage.removeItem(STORAGE_KEY);
    };

    const resetFormData = () => {
        setFormData({
            videoUpload: {
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

        // 新文件开始前，确保中断上一轮上传并清理旧预览。
        abortUploadAndInvalidateSession();
        resetPreviewState();
        clearCache();
        const sessionId = uploadSessionIdRef.current;

        setUploading(true);
        setProgress(0);

        try {
            // 本地预览：优先用 blob URL 播放，不依赖云端预签名 URL。
            const objectUrl = URL.createObjectURL(file);
            setNewLocalPreviewUrl(objectUrl);
            setPreviewSource('local');
            didAutoSwitchToCloudRef.current = false;

            // 先写入稳定文件信息（用于右侧面板即时展示）。
            setFormData(prev => ({
                ...prev,
                videoUpload: {
                    ...prev.videoUpload,
                    videoSize: file.size,
                    fileName: file.name,
                    fileType: file.type,
                    // 新文件开始时清空上传产物字段。
                    videoKey: '',
                    r2Key: '',
                    r2Bucket: '',
                    fileId: '',
                    thumbnailUrl: '',
                    videoDuration: 0,
                }
            }));

            // 获取视频时长（metadata 读取很快，不 revoke objectURL，交由页面生命周期统一释放）。
            const videoElement = document.createElement('video');
            videoElement.preload = 'metadata';
            videoElement.src = objectUrl;
            const videoDuration = await new Promise<number>((resolve, reject) => {
                const timeoutId = window.setTimeout(() => {
                    reject(new Error('timeout'));
                }, 4000);

                videoElement.onloadedmetadata = () => {
                    window.clearTimeout(timeoutId);
                    const d = Number.isFinite(videoElement.duration) ? videoElement.duration : 0;
                    resolve(Math.round(d * 10) / 10);
                };
                videoElement.onerror = () => {
                    window.clearTimeout(timeoutId);
                    reject(new Error('Failed to read video metadata'));
                };
            }).catch(() => 0);

            if (uploadSessionIdRef.current !== sessionId) return;
            setFormData(prev => ({
                ...prev,
                videoUpload: {
                    ...prev.videoUpload,
                    videoDuration,
                }
            }));

            // Upload (multipart upload with parallel chunks)
            const { MultipartUploader } = await import('@/shared/lib/multipart-upload');
            const uploader = new MultipartUploader();
            uploaderRef.current = uploader;
            const result = await uploader.upload(file, {
                onProgress: (p) => {
                    if (uploadSessionIdRef.current !== sessionId) return;
                    setProgress(p);
                },
                onStatus: (status) => {
                    if (uploadSessionIdRef.current !== sessionId) return;
                    console.log('[Multipart Upload]', status);
                },
            });

            if (uploadSessionIdRef.current !== sessionId) return;
            setFormData(prev => ({
                ...prev,
                videoUpload: {
                    ...prev.videoUpload,
                    videoKey: result.key,
                    r2Key: result.keyV,
                    r2Bucket: result.bucket,
                    fileId: result.fileId,
                },
            }));
            toast.success(t('upload.uploadSuccess'));
        } catch (error: any) {
            if (uploadSessionIdRef.current !== sessionId) return;
            if (String(error?.message || '').toLowerCase().includes('aborted')) {
                // 用户主动取消上传：不弹错误。
                return;
            }
            console.error('Upload error:', error);
            toast.error(error.message || t('upload.uploadFailed'));
            clearCache();
            resetFormData();
            resetPreviewState();
        } finally {
            if (uploadSessionIdRef.current === sessionId) {
                setUploading(false);
                uploaderRef.current = null;
                if (videoInputRef.current) videoInputRef.current.value = '';
            }
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
        abortUploadAndInvalidateSession();
        clearCache();
        resetFormData();
        resetPreviewState();
        setUploading(false);
        setProgress(0);
        toast.info(t('upload.videoDeleted'));
    };

    // Submission
    const handleStartClick = () => {
        if (!isUploadComplete) {
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
        fd.append("fileId", formData.videoUpload.fileId);

        try {
            const res = await fetch("/api/video-task/create", { method: "POST", body: fd });
            const data = await res.json();

            if (data?.code === 0) {
                const fileId = (data?.data?.originalFileId as string | undefined) || formData.videoUpload.fileId;
                if (!fileId) {
                    toast.error(t('messages.submitFailed'));
                    return;
                }
                clearCache();
                resetFormData();
                toast.success(t('messages.taskCreated'));
                router.replace(`/dashboard/projects/${encodeURIComponent(fileId)}`);
            } else {
                toast.error(data?.message || t('messages.submitFailed'));
            }
        } catch {
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
                            !hasPreview
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

                            {!hasPreview ? (
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
                                        ref={previewVideoRef}
                                        src={activePreviewUrl}
                                        controls
                                        preload="auto"
                                        className="w-full h-full max-h-full object-contain relative z-10"
                                        onLoadedMetadata={() => {
                                            clearStallTimer();
                                            if (previewSourceRef.current !== 'cloud') return;
                                            const restore = pendingPlaybackRestoreRef.current;
                                            if (!restore) return;
                                            pendingPlaybackRestoreRef.current = null;

                                            const v = previewVideoRef.current;
                                            if (!v) return;
                                            try {
                                                v.playbackRate = restore.playbackRate;
                                            } catch {
                                                // ignore
                                            }
                                            try {
                                                const duration = Number.isFinite(v.duration) ? v.duration : 0;
                                                const maxSeek = duration > 0 ? Math.max(0, duration - 0.05) : restore.time;
                                                v.currentTime = Math.max(0, Math.min(restore.time, maxSeek));
                                            } catch {
                                                // ignore
                                            }
                                            if (!restore.paused) {
                                                v.play().catch(() => {
                                                    // ignore
                                                });
                                            }
                                        }}
                                        onError={() => {
                                            clearStallTimer();
                                            // 强触发：本地预览异常时自动切换云端预览。
                                            if (previewSourceRef.current === 'local') {
                                                switchToCloudPreview('error');
                                            }
                                        }}
                                        onWaiting={() => {
                                            armStallSwitchIfNeeded();
                                        }}
                                        onStalled={() => {
                                            armStallSwitchIfNeeded();
                                        }}
                                        onPlaying={() => {
                                            clearStallTimer();
                                        }}
                                        onCanPlay={() => {
                                            clearStallTimer();
                                        }}
                                        onTimeUpdate={() => {
                                            clearStallTimer();
                                        }}
                                        onSeeking={() => {
                                            clearStallTimer();
                                        }}
                                        onPause={() => {
                                            clearStallTimer();
                                        }}
                                    />

                                    {uploading ? (
                                        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-black/20">
                                            <div className="flex flex-col items-center gap-2 rounded-md bg-black/60 px-4 py-3">
                                                <Loader2 className="h-6 w-6 animate-spin text-white/80" />
                                                <div className="text-xs font-mono text-white/80">{progress}%</div>
                                            </div>
                                        </div>
                                    ) : null}
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
                        {hasSelectedFile && (
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
                                    disabled={submitting || uploading || !isUploadComplete || !user?.id || !user?.credits}
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
                sourceLanguage={formData.sourceLanguage}
                targetLanguage={formData.targetLanguage}
                speakerCount={formData.peoples}
            />
        </div>
    );
}
