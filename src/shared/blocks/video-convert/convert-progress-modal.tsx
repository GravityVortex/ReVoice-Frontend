'use client';

import { useEffect, useState, useRef } from 'react';
import { cn, getLanguageConvertStr, LanguageMap, LanguageMapEn, miao2Hms } from '@/shared/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/shared/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import {
    CheckCircle2,
    Loader2,
    Clock,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

interface TaskStep {
    id: number;
    startedAt: number;
    completedAt: number;
    stepName: string;
    // pending/processing/completed/failed/cancelled'
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    errorMessage: string;
}

interface TaskItem {
    id: string;
    userId: string;
    originalFileId: string;
    status: string;
    priority: number;
    progress: number;
    currentStep: string | null;
    sourceLanguage: string;
    targetLanguage: string;
    speakerCount: string;
    processDurationSeconds: number;
    creditId: string;
    creditsConsumed: number;
    errorMessage: string | null;
    startedAt: string | null;
    completedAt: string | null;
    createdBy: string;
    createdAt: string;
    updatedBy: string;
    updatedAt: string;
    delStatus: number;
}

interface ConversionProgressModalProps {
    isOpen: boolean;
    activeTabIdx: string;
    onClose: () => void;
    taskMainId: string;
}

export function ConversionProgressModal({
    isOpen,
    activeTabIdx,
    onClose,
    taskMainId,
}: ConversionProgressModalProps) {
    // console.log('ConversionProgressModal activeTabIdx--->', activeTabIdx);
    const [activeTab, setActiveTab] = useState(activeTabIdx === '1' ? 'tab_progress' : 'tab_detail');
    const [loading, setLoading] = useState(false);
    // 记住状态变更之前的值，不是响应式，不会随着组件的更新而更新。
    const prevTaskMainIdRef = useRef<string | null>(null);
    const [progressData, setProgressData] = useState<TaskStep[] | null>(null);
    const [taskMainInfo, setTaskMainInfo] = useState<TaskItem | null>(null);
    // 轮询定时器ID
    const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
    // 步骤元素引用，用于自动滚动
    const stepRefsRef = useRef<Map<number, HTMLDivElement>>(new Map());

    const params = useParams();
    const locale = (params.locale as string) || 'zh';
    const t = useTranslations('video_convert.projectDetail');
    const tSteps = useTranslations('video_convert.projectDetail.steps');

    // 根据 activeTabIdx 切换 tab
    // useEffect: 进行副作用执行，例如在组件加载或者在组件更新的时候执行一些函数
    useEffect(() => {
        if (activeTabIdx === '0') {
            setActiveTab('tab_detail');
        }
        else if (activeTabIdx === '1') {
            setActiveTab('tab_progress');
        }
    }, [activeTabIdx, taskMainId]);

    // 清除轮询定时器
    const clearPolling = () => {
        if (pollingTimerRef.current) {
            clearInterval(pollingTimerRef.current);
            pollingTimerRef.current = null;
            console.log('轮询已停止并已经销毁。');
        }
    };

    // 启动轮询
    const startPolling = () => {
        // 先清除可能存在的旧定时器
        clearPolling();

        // 立即执行一次
        fetchConversionProgress();

        // 启动5秒间隔的轮询
        pollingTimerRef.current = setInterval(() => {
            console.log('轮询查询进度--->', taskMainId);
            fetchConversionProgress();
        }, 15000);

        console.log('轮询已启动，间隔5秒');
    };

    // 监听弹框打开/关闭状态，控制轮询
    useEffect(() => {
        if (isOpen && taskMainId) {
            // 检查 taskMainId 是否与上次相同
            const taskIdChanged = prevTaskMainIdRef.current !== taskMainId;

            if (taskIdChanged) {
                // 更新 prevTaskMainId
                prevTaskMainIdRef.current = taskMainId;
            }

            // 只有在任务未完成时才启动轮询
            if (!taskMainInfo || (taskMainInfo.status !== 'completed' && taskMainInfo.status !== 'failed' && taskMainInfo.status !== 'cancelled')) {
                startPolling();
            }
        } else {
            // 弹框关闭时停止轮询
            clearPolling();
        }

        // 组件卸载时清除轮询
        return () => {
            clearPolling();
        };
    }, [isOpen, taskMainId]);

    // 监听任务状态变化，控制轮询
    useEffect(() => {
        if (taskMainInfo && isOpen) {
            const status = taskMainInfo.status;
            if (status === 'completed' || status === 'failed' || status === 'cancelled') {
                clearPolling();
            } else if (status === 'processing' || status === 'pending') {
                // 确保轮询正在运行
                if (!pollingTimerRef.current) {
                    startPolling();
                }
            }
        }
    }, [taskMainInfo?.status, isOpen]);

    // 监听 progressData 变化，在 tab_progress 页面时自动滚动到 processing 步骤
    useEffect(() => {
        if (isOpen && activeTab === 'tab_progress' && progressData && progressData.length > 0) {
            // 使用更长的延迟确保 DOM 完全渲染
            const timer = setTimeout(() => {
                scrollToProcessingStep(progressData);
            }, 200);

            return () => clearTimeout(timer);
        }
    }, [progressData, activeTab, isOpen]);

    // 根据进度百分比获取当前步骤描述
    const getProgressStep = (progress: number): string => {
        if (progress >= 0 && progress <= 11) return tSteps('audioVideoSeparation');
        if (progress >= 12 && progress <= 22) return tSteps('vocalBackgroundSeparation');
        if (progress >= 23 && progress <= 33) return tSteps('generateSubtitles');
        if (progress >= 34 && progress <= 44) return tSteps('translateSubtitles');
        if (progress >= 45 && progress <= 55) return tSteps('audioSlicing');
        if (progress >= 56 && progress <= 66) return tSteps('voiceSynthesis');
        if (progress >= 67 && progress <= 77) return tSteps('audioAlignment');
        if (progress >= 78 && progress <= 88) return tSteps('mergeAudio');
        if (progress >= 89 && progress <= 100) return tSteps('mergeVideo');
        return t('progressModal.loading');
    };
    const getProgressStatus = (status: string): string => {
        if (status === 'split_audio_video') return tSteps('audioVideoSeparation');
        if (status === 'split_vocal_bkground') return tSteps('vocalBackgroundSeparation');
        if (status === 'gen_srt') return tSteps('generateSubtitles');
        if (status === 'translate_srt') return tSteps('translateSubtitles');
        if (status === 'split_audio') return tSteps('audioSlicing');
        if (status === 'tts') return tSteps('voiceSynthesis');
        if (status === 'adj_audio_time') return tSteps('audioAlignment');
        if (status === 'merge_audios') return tSteps('mergeAudio');
        if (status === 'merge_audio_video') return tSteps('mergeVideo');
        return t('progressModal.loading');
    };

    // 滚动到首个 processing 状态的步骤
    const scrollToProcessingStep = (progressList: TaskStep[]) => {
        // 找到首个 processing 状态的步骤
        const processingStep = progressList.find(step => step.status === 'processing');

        if (processingStep) {
            // 使用 setTimeout 确保 DOM 已更新
            setTimeout(() => {
                const stepElement = stepRefsRef.current.get(processingStep.id);
                if (stepElement) {
                    stepElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                    });
                    console.log('自动滚动到步骤:', processingStep.stepName);
                }
            }, 100);
        }
    };

    // API请求
    const fetchConversionProgress = async () => {
        // setLoading(true);
        // console.warn('请求taskMainId--->', taskMainId);
        try {

            const response = await fetch('/api/video-task/getTaskProgress?taskId=' + taskMainId + '&progress=true');
            const result = await response.json();

            if (result.code === 0 && result.data) {
                const { progressList, taskItem } = result.data;
                // 更新进度条
                setProgressData(progressList);
                // 更新任务信息
                setTaskMainInfo(taskItem);

                // 如果任务已结束，停止轮询
                if (taskItem.status === 'completed' || taskItem.status === 'failed' || taskItem.status === 'cancelled') {
                    clearPolling();
                }
            }
        } catch (error) {
            console.error('获取转换进度失败:', error);
        } finally {
            // setLoading(false);
        }
    };

    function getLanguage(lan?: string) {
        if (!lan) return '';
        const map = locale === 'zh' ? LanguageMap : LanguageMapEn;
        return map[lan] || lan;
    }

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="min-w-[780px] max-w-[80vw] h-[80vh] flex flex-col p-0">

                {/* Tab 切换 */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
                        <DialogTitle>{t('progressModal.title')}【{taskMainInfo ? getLanguageConvertStr(taskMainInfo, locale) : t('progressModal.loading')}】</DialogTitle>
                        {/* 省略则警告：Warning: Missing Description or aria-describedby={undefined} for {DialogContent} */}
                        <DialogDescription className="sr-only">
                            {t('progressModal.title')}
                        </DialogDescription>
                        <TabsList className="mt-5 grid w-2/3 grid-cols-2 mx-auto">
                            <TabsTrigger value="tab_detail">{t('progressModal.tabs.overview')}</TabsTrigger>
                            <TabsTrigger value="tab_progress">{t('progressModal.tabs.logs')}</TabsTrigger>
                        </TabsList>
                    </DialogHeader>

                    {!progressData || progressData.length === 0 ? (
                        <div className="flex items-center justify-center py-12 flex-1">
                            <Loader2 className="size-8 animate-spin text-primary" />
                            <span className="ml-3 text-muted-foreground">{t('progressModal.loadingData')}</span>
                        </div>
                    ) : progressData ? (
                        <div className="flex-1 overflow-y-auto px-6 pb-6">
                            <div className="space-y-6">

                                <TabsContent value="tab_detail" className="mt-1">

                                    <Card>
                                        <CardHeader>
                                            <CardTitle>{t('progressModal.overview.progressTitle')}</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-muted-foreground">{t('progressModal.overview.totalProgress')}</span>
                                                    <span className="text-2xl font-bold text-primary">
                                                        {taskMainInfo?.progress}%
                                                    </span>
                                                </div>
                                                <div className="h-2 w-full rounded-full bg-gray-600">
                                                    <div
                                                        className={cn("h-full rounded-full bg-primary", (taskMainInfo?.progress ?? 0) < 100 && "transition-all duration-500")}
                                                        style={{ width: `${taskMainInfo?.progress ?? 0}%` }}
                                                    ></div>
                                                </div>

                                                {/* 步骤展示 */}
                                                <div className="pt-1 flex flex-row justify-between gap-2">
                                                    {[
                                                        { name: tSteps('audioVideoSeparation'), range: [0, 11] },
                                                        { name: tSteps('vocalBackgroundSeparation'), range: [12, 22] },
                                                        { name: tSteps('generateSubtitles'), range: [23, 33] },
                                                        { name: tSteps('translateSubtitles'), range: [34, 44] },
                                                        { name: tSteps('audioSlicing'), range: [45, 55] },
                                                        { name: tSteps('voiceSynthesis'), range: [56, 66] },
                                                        { name: tSteps('audioAlignment'), range: [67, 77] },
                                                        { name: tSteps('mergeAudio'), range: [78, 88] },
                                                        { name: tSteps('mergeVideo'), range: [89, 100] },
                                                    ].map((step, index) => {
                                                        const progress = taskMainInfo?.progress || 0;
                                                        const isActive = progress >= step.range[0] && progress < step.range[1];
                                                        const isCompleted = progress >= step.range[1];

                                                        return (
                                                            <div key={index} className="text-center">
                                                                <p className={cn(
                                                                    "flex flex-row items-center gap-1 text-xs font-medium transition-colors",
                                                                    isActive && "text-cyan-600 font-semibold",
                                                                    isCompleted && "text-green-600",
                                                                    !isActive && !isCompleted && "text-gray-400"
                                                                )}>
                                                                    {step.name}
                                                                    {isActive && (<Loader2 className="size-4 animate-spin text-cyan-600" />)}
                                                                </p>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card className='mt-5'>
                                        <CardHeader>
                                            <CardTitle>{t('progressModal.overview.taskInfoTitle')}</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    {/* <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">任务ID</p>
                                                        <p className="font-medium text-xs break-all">{taskMainInfo?.id}</p>
                                                    </div> */}
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">{t('progressModal.overview.startTime')}</p>
                                                        <p className="font-medium">{taskMainInfo?.startedAt ? new Date(taskMainInfo.startedAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US') : '-'}</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">{t('progressModal.overview.endTime')}</p>
                                                        <p className="font-medium">{taskMainInfo?.completedAt ? new Date(taskMainInfo.completedAt).toLocaleString(locale === 'zh' ? 'zh-CN' : 'en-US') : '-'}</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">{t('progressModal.overview.sourceLanguage')}</p>
                                                        <p className="font-medium">{getLanguage(taskMainInfo?.sourceLanguage)}</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">{t('progressModal.overview.targetLanguage')}</p>
                                                        <p className="font-medium">{getLanguage(taskMainInfo?.targetLanguage)}</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">{t('progressModal.overview.taskStatus')}</p>
                                                        <p className="font-medium">{taskMainInfo?.status ? t(`status.${taskMainInfo.status}`) : '-'}</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">{t('progressModal.overview.speakerCount')}</p>
                                                        <p className="font-medium">{taskMainInfo?.speakerCount === 'single' ? t('progressModal.overview.single') : t('progressModal.overview.multiple')}</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">{t('progressModal.overview.processDuration')}</p>
                                                        <p className="font-medium">{miao2Hms(taskMainInfo?.processDurationSeconds || 0)}</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">{t('progressModal.overview.creditsConsumed')}</p>
                                                        <p className="font-medium">{taskMainInfo?.creditsConsumed || 0}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </TabsContent>

                                <TabsContent value="tab_progress" className="mt-1 max-h-[65vh] overflow-hidden overflow-y-auto"
                                    style={{ borderRadius: 10 }}>
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>{t('progressModal.logs.title')}</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="relative space-y-1">
                                                {/* 时间轴线 */}
                                                <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-border"></div>

                                                {progressData.map((task, index) => {
                                                    const formatTime = (timestamp: number) => {
                                                        if (!timestamp) return '-';
                                                        const date = new Date(timestamp);
                                                        return date.toLocaleTimeString(locale === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                                    };

                                                    return (
                                                        <div
                                                            key={(task.id + '_' + index)}
                                                            className="relative flex gap-2"
                                                            ref={(el) => {
                                                                if (el) {
                                                                    stepRefsRef.current.set(task.id, el);
                                                                } else {
                                                                    stepRefsRef.current.delete(task.id);
                                                                }
                                                            }}
                                                        >
                                                            {/* 状态图标 */}
                                                            <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 bg-background">
                                                                {task.status === 'completed' && (
                                                                    <CheckCircle2 className="size-5 text-green-600" />
                                                                )}
                                                                {task.status === 'processing' && (
                                                                    <Loader2 className="size-5 animate-spin text-orange-500" />
                                                                )}
                                                                {task.status === 'pending' && (
                                                                    <Clock className="size-5 text-gray-400" />
                                                                )}
                                                                {task.status === 'failed' && (
                                                                    <CheckCircle2 className="size-5 text-red-600" />
                                                                )}
                                                            </div>

                                                            {/* 日志内容 */}
                                                            <div className="flex-1 pb-2">
                                                                <div
                                                                    className={cn(
                                                                        'rounded-lg border p-4 transition-all',
                                                                        task.status === 'completed' && 'border-green-300',
                                                                        task.status === 'processing' && 'border-orange-300',
                                                                        task.status === 'pending' && 'border-gray-300',
                                                                        task.status === 'failed' && 'border-red-300'
                                                                    )}
                                                                >
                                                                    <div className="flex items-start justify-between gap-4">
                                                                        <div className="flex-1">
                                                                            <div className="flex items-center gap-2">
                                                                                <h4 className="font-semibold">{getProgressStatus(task.stepName)}</h4>
                                                                                <span
                                                                                    className={cn(
                                                                                        'rounded-full px-2 py-0.5 text-xs font-medium',
                                                                                        task.status === 'completed' &&
                                                                                        'bg-green-100 text-green-700',
                                                                                        task.status === 'processing' &&
                                                                                        'bg-orange-100 text-orange-700',
                                                                                        task.status === 'pending' && 'bg-gray-100 text-gray-600',
                                                                                        task.status === 'failed' && 'bg-red-100 text-red-700'
                                                                                    )}
                                                                                >
                                                                                    {task.status === 'completed' && t('progressModal.logs.statusCompleted')}
                                                                                    {task.status === 'processing' && t('progressModal.logs.statusProcessing')}
                                                                                    {task.status === 'pending' && t('progressModal.logs.statusPending')}
                                                                                    {task.status === 'failed' && t('progressModal.logs.statusFailed')}
                                                                                </span>
                                                                            </div>
                                                                            <p className="mt-1 text-sm text-muted-foreground">
                                                                                {task.status === 'completed' && `${getProgressStatus(task.stepName)}${t('progressModal.logs.completedDesc')}`}
                                                                                {task.status === 'processing' && `${getProgressStatus(task.stepName)}${t('progressModal.logs.processingDesc')}`}
                                                                                {task.status === 'pending' && `${t('progressModal.logs.pendingDesc')}${task.stepName}`}
                                                                                {task.status === 'failed' && `${getProgressStatus(task.errorMessage)}`}
                                                                            </p>
                                                                            {task.status === 'failed' && task.errorMessage && (
                                                                                <p className="mt-2 text-xs text-red-600">
                                                                                    {t('progressModal.logs.errorLabel')}: {task.errorMessage}
                                                                                </p>
                                                                            )}
                                                                            {task.status === 'completed' && task.completedAt && (
                                                                                <p className="mt-2 text-xs text-muted-foreground">
                                                                                    {t('progressModal.logs.completedTime')}: {formatTime(task.completedAt)}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                                                                            {task.startedAt ? formatTime(task.startedAt) : '-'}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </CardContent>
                                    </Card>
                                </TabsContent>

                            </div>
                        </div>
                    ) : null}

                </Tabs>
            </DialogContent>
        </Dialog>
    );
}
