'use client';

import { useEffect, useState, useRef } from 'react';
import { cn, getLanguageConvertStr, LanguageMap, miao2Hms } from '@/shared/lib/utils';
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

interface TaskStep {
    id: number;
    startedAt: number;
    completedAt: number;
    stepName: string;
    // pending/processing/completed/failed/cancelled'
    stepStatus: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
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
    const [activeTab, setActiveTab] = useState(activeTabIdx === '1' ? 'logs' : 'overview');
    const [loading, setLoading] = useState(false);
    // 记住状态变更之前的值，不是响应式，不会随着组件的更新而更新。
    const prevTaskMainIdRef = useRef<string | null>(null);
    const [progressData, setProgressData] = useState<TaskStep[] | null>(null);
    const [taskMainInfo, setTaskMainInfo] = useState<TaskItem | null>(null);
    
    // 根据 activeTabIdx 切换 tab
    // useEffect: 进行副作用执行，例如在组件加载或者在组件更新的时候执行一些函数
    useEffect(() => {
        if (activeTabIdx === '1') {
            setActiveTab('logs');
        } else if (activeTabIdx === '0') {
            setActiveTab('overview');
        }
    }, [activeTabIdx, taskMainId]);

    // 模拟请求获取转换进度数据 - 只在 taskMainId 变化时请求
    useEffect(() => {
        if (isOpen && taskMainId) {
            // 检查 taskMainId 是否与上次相同
            if (prevTaskMainIdRef.current === taskMainId) {
                console.warn('taskMainId 未变化，跳过接口请求--->', taskMainId);
                return;
            }
            
            // 更新 prevTaskMainId
            prevTaskMainIdRef.current = taskMainId;
            fetchConversionProgress();
        }
    }, [isOpen, taskMainId]);

    // 根据进度百分比获取当前步骤描述
    const getProgressStep = (progress: number): string => {
        if (progress >= 0 && progress <= 11) return '音视频分离';
        if (progress >= 12 && progress <= 22) return '人声背景分离';
        if (progress >= 23 && progress <= 33) return '生成原始字幕';
        if (progress >= 34 && progress <= 44) return '翻译字幕';
        if (progress >= 45 && progress <= 55) return '音频切片';
        if (progress >= 56 && progress <= 66) return '语音合成';
        if (progress >= 67 && progress <= 77) return '音频时间对齐';
        if (progress >= 78 && progress <= 88) return '合并音频';
        if (progress >= 89 && progress <= 100) return '合并音视频';
        return '准备中...';
    };

    // 模拟 API 请求函数
    const fetchConversionProgress = async () => {
        setLoading(true);
        console.warn('模拟接口请求taskMainId--->', taskMainId);
        try {
            
            const response = await fetch('/api/video-task/getTaskDetail?taskId=' + taskMainId);
            const result = await response.json();
            
            if (result.code === 0 && result.data) {
                const { progressList, taskItem } = result.data;
                
                setProgressData(progressList);
                setTaskMainInfo(taskItem);
            }
        } catch (error) {
            console.error('获取转换进度失败:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="min-w-3/5 max-w-[80vw] h-[80vh] flex flex-col p-0">

                {/* Tab 切换 */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
                        <DialogTitle>转换进度【{taskMainInfo ? getLanguageConvertStr(taskMainInfo) : '加载中...'}】</DialogTitle>
                        {/* 省略则警告：Warning: Missing Description or aria-describedby={undefined} for {DialogContent} */}
                        <DialogDescription className="sr-only">
                            查看视频转换的详细进度信息和日志
                        </DialogDescription>
                        <TabsList className="mt-5 grid w-2/3 grid-cols-2 mx-auto">
                            <TabsTrigger value="overview">转换概览</TabsTrigger>
                            <TabsTrigger value="logs">进度日志</TabsTrigger>
                        </TabsList>
                    </DialogHeader>

                    {loading ? (
                        <div className="flex items-center justify-center py-12 flex-1">
                            <Loader2 className="size-8 animate-spin text-primary" />
                            <span className="ml-3 text-muted-foreground">加载进度数据中...</span>
                        </div>
                    ) : progressData ? (
                        <div className="flex-1 overflow-y-auto px-6 pb-6">
                            <div className="space-y-6">

                                <TabsContent value="overview" className="mt-1">

                                    <Card>
                                        <CardHeader>
                                            <CardTitle>转换进度</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-muted-foreground">总进度</span>
                                                    <span className="text-2xl font-bold text-primary">
                                                        {taskMainInfo?.progress}%
                                                    </span>
                                                </div>
                                                <div className="h-2 w-full rounded-full bg-gray-600">
                                                    <div
                                                        className="h-full rounded-full bg-primary transition-all duration-500"
                                                        style={{ width: `${taskMainInfo?.progress}%` }}
                                                    ></div>
                                                </div>
                                                
                                                {/* 步骤展示 */}
                                                <div className="pt-1 flex flex-row justify-between gap-2">
                                                    {[
                                                        { name: '音视频分离', range: [0, 11] },
                                                        { name: '人声背景分离', range: [12, 22] },
                                                        { name: '生成原始字幕', range: [23, 33] },
                                                        { name: '翻译字幕', range: [34, 44] },
                                                        { name: '音频切片', range: [45, 55] },
                                                        { name: '语音合成', range: [56, 66] },
                                                        { name: '音频时间对齐', range: [67, 77] },
                                                        { name: '合并音频', range: [78, 88] },
                                                        { name: '合并音视频', range: [89, 100] },
                                                    ].map((step, index) => {
                                                        const progress = taskMainInfo?.progress || 0;
                                                        const isActive = progress >= step.range[0] && progress <= step.range[1];
                                                        const isCompleted = progress > step.range[1];
                                                        
                                                        return (
                                                            <div key={index} className="text-center">
                                                                <p className={cn(
                                                                    "flex flex-row items-center gap-1 text-xs font-medium transition-colors",
                                                                    isActive && "text-primary font-semibold",
                                                                    isCompleted && "text-green-600",
                                                                    !isActive && !isCompleted && "text-gray-400"
                                                                )}>
                                                                    {step.name}
                                                                    {isActive && (<Loader2 className="size-4 animate-spin text-primary" />)}
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
                                            <CardTitle>任务详细信息</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    {/* <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">任务ID</p>
                                                        <p className="font-medium text-xs break-all">{taskMainInfo?.id}</p>
                                                    </div> */}
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">开始时间</p>
                                                        <p className="font-medium">{taskMainInfo?.startedAt ? new Date(taskMainInfo.startedAt).toLocaleString('zh-CN') : '-'}</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">结束时间</p>
                                                        <p className="font-medium">{taskMainInfo?.completedAt ? new Date(taskMainInfo.completedAt).toLocaleString('zh-CN') : '-'}</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">源语言</p>
                                                        <p className="font-medium">{LanguageMap[taskMainInfo?.sourceLanguage || ''] || taskMainInfo?.sourceLanguage}</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">目标语言</p>
                                                        <p className="font-medium">{LanguageMap[taskMainInfo?.targetLanguage || ''] || taskMainInfo?.targetLanguage}</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">任务状态</p>
                                                        <p className="font-medium">{taskMainInfo?.status}</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">说话人数量</p>
                                                        <p className="font-medium">{taskMainInfo?.speakerCount === 'single' ? '单人' : '多人'}</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">处理时长</p>
                                                        <p className="font-medium">{miao2Hms(taskMainInfo?.processDurationSeconds || 0)}</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">消耗积分</p>
                                                        <p className="font-medium">{taskMainInfo?.creditsConsumed || 0}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </TabsContent>

                                <TabsContent value="logs" className="mt-1 max-h-[65vh] overflow-hidden overflow-y-auto"
                                    style={{ borderRadius: 10 }}>
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>转换进度日志</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="relative space-y-1">
                                                {/* 时间轴线 */}
                                                <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-border"></div>

                                                {progressData.map((task) => {
                                                    const formatTime = (timestamp: number) => {
                                                        if (!timestamp) return '-';
                                                        const date = new Date(timestamp);
                                                        return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                                    };
                                                    
                                                    return (
                                                        <div key={task.id} className="relative flex gap-2">
                                                            {/* 状态图标 */}
                                                            <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 bg-background">
                                                                {task.stepStatus === 'completed' && (
                                                                    <CheckCircle2 className="size-5 text-green-600" />
                                                                )}
                                                                {task.stepStatus === 'processing' && (
                                                                    <Loader2 className="size-5 animate-spin text-orange-500" />
                                                                )}
                                                                {task.stepStatus === 'pending' && (
                                                                    <Clock className="size-5 text-gray-400" />
                                                                )}
                                                                {task.stepStatus === 'failed' && (
                                                                    <CheckCircle2 className="size-5 text-red-600" />
                                                                )}
                                                            </div>

                                                            {/* 日志内容 */}
                                                            <div className="flex-1 pb-2">
                                                                <div
                                                                    className={cn(
                                                                        'rounded-lg border p-4 transition-all',
                                                                        task.stepStatus === 'completed' && 'border-green-300',
                                                                        task.stepStatus === 'processing' && 'border-orange-300',
                                                                        task.stepStatus === 'pending' && 'border-gray-300',
                                                                        task.stepStatus === 'failed' && 'border-red-300'
                                                                    )}
                                                                >
                                                                    <div className="flex items-start justify-between gap-4">
                                                                        <div className="flex-1">
                                                                            <div className="flex items-center gap-2">
                                                                                <h4 className="font-semibold">{task.stepName}</h4>
                                                                                <span
                                                                                    className={cn(
                                                                                        'rounded-full px-2 py-0.5 text-xs font-medium',
                                                                                        task.stepStatus === 'completed' &&
                                                                                        'bg-green-100 text-green-700',
                                                                                        task.stepStatus === 'processing' &&
                                                                                        'bg-orange-100 text-orange-700',
                                                                                        task.stepStatus === 'pending' && 'bg-gray-100 text-gray-600',
                                                                                        task.stepStatus === 'failed' && 'bg-red-100 text-red-700'
                                                                                    )}
                                                                                >
                                                                                    {task.stepStatus === 'completed' && '已完成'}
                                                                                    {task.stepStatus === 'processing' && '进行中'}
                                                                                    {task.stepStatus === 'pending' && '等待中'}
                                                                                    {task.stepStatus === 'failed' && '失败'}
                                                                                </span>
                                                                            </div>
                                                                            <p className="mt-1 text-sm text-muted-foreground">
                                                                                {task.stepStatus === 'completed' && `${task.stepName}已完成`}
                                                                                {task.stepStatus === 'processing' && `${task.stepName}进行中`}
                                                                                {task.stepStatus === 'pending' && `等待${task.stepName}`}
                                                                                {task.stepStatus === 'failed' && `${task.errorMessage}`}
                                                                            </p>
                                                                            {task.stepStatus === 'failed' && task.errorMessage && (
                                                                                <p className="mt-2 text-xs text-red-600">
                                                                                    错误: {task.errorMessage}
                                                                                </p>
                                                                            )}
                                                                            {task.stepStatus === 'completed' && task.completedAt && (
                                                                                <p className="mt-2 text-xs text-muted-foreground">
                                                                                    完成时间: {formatTime(task.completedAt)}
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
