'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/shared/lib/utils';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/shared/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import {
    CheckCircle2,
    Loader2,
    Clock,
} from 'lucide-react';

interface ProgressLog {
    id: number;
    time: string;
    step: string;
    status: 'completed' | 'processing' | 'pending';
    message: string;
    details: string;
}

interface ConversionProgressModalProps {
    isOpen: boolean;
    onClose: () => void;
    convertId: string;
}

export function ConversionProgressModal({
    isOpen,
    onClose,
    convertId,
}: ConversionProgressModalProps) {
    const [activeTab, setActiveTab] = useState('overview');
    const [loading, setLoading] = useState(false);
    const [progressData, setProgressData] = useState<{
        progress: number;
        completed: number;
        processing: number;
        pending: number;
        logs: ProgressLog[];
        taskInfo: {
            taskId: string;
            name: string;
            createTime: string;
            sourceLanguage: string;
            targetLanguage: string;
            estimatedTime: string;
            engine: string;
        };
    } | null>(null);

    // 模拟请求获取转换进度数据
    useEffect(() => {
        if (isOpen && convertId) {
            fetchConversionProgress();
        }
    }, [isOpen, convertId]);

    const fetchConversionProgress = async () => {
        setLoading(true);

        console.log('转换进度 convertId--->', convertId);

        // 模拟 API 请求延迟
        await new Promise(resolve => setTimeout(resolve, 800));

        // 模拟返回的进度数据
        const mockData = {
            progress: 66,
            completed: 6,
            processing: 1,
            pending: 2,
            logs: [
                {
                    id: 1,
                    time: '14:00:00',
                    step: '任务创建',
                    status: 'completed' as const,
                    message: '转换任务已创建',
                    details: `任务ID: ${convertId} | 优先级: 普通`,
                },
                {
                    id: 2,
                    time: '14:00:15',
                    step: '视频上传',
                    status: 'completed' as const,
                    message: '源视频上传完成',
                    details: '文件大小: 125.6 MB | 上传速度: 8.3 MB/s',
                },
                {
                    id: 3,
                    time: '14:00:45',
                    step: '音频提取',
                    status: 'completed' as const,
                    message: '音频轨道提取成功',
                    details: '音频格式: AAC | 采样率: 48kHz | 比特率: 192kbps',
                },
                {
                    id: 4,
                    time: '14:01:20',
                    step: '语音识别',
                    status: 'completed' as const,
                    message: '语音转文字完成',
                    details: '识别引擎: Whisper Large v3 | 准确率: 96.8% | 字数: 1,245 | 进度: 67% | 音色: Jenny (Female) | 进度: 67% | 进度: 67% | 音色: Jenny (Female) | 进度: 67% | 进度: 67% | 音色: Jenny (Female) | 进度: 67% | 进度: 67% | 音色: Jenny (Female) | 进度: 67%',
                },
                {
                    id: 5,
                    time: '14:02:10',
                    step: '文本翻译',
                    status: 'completed' as const,
                    message: '文本翻译完成',
                    details: '翻译引擎: GPT-4 | 源语言: 中文 | 目标语言: 英语',
                },
                {
                    id: 6,
                    time: '14:02:50',
                    step: '字幕时间轴对齐',
                    status: 'completed' as const,
                    message: '字幕时间轴同步完成',
                    details: '字幕段数: 156 | 平均时长: 3.2秒/段',
                },
                {
                    id: 7,
                    time: '14:03:15',
                    step: '语音合成',
                    status: 'processing' as const,
                    message: '正在生成目标语言配音...',
                    details: 'TTS引擎: Azure Neural Voice | 音色: Jenny (Female) | 进度: 67% | 音色: Jenny (Female) | 进度: 67% | 进度: 67% | 音色: Jenny (Female) | 进度: 67% | 进度: 67% | 音色: Jenny (Female) | 进度: 67% | 进度: 67% | 音色: Jenny (Female) | 进度: 67%',
                },
                {
                    id: 8,
                    time: '-',
                    step: '视频合成',
                    status: 'pending' as const,
                    message: '等待语音合成完成',
                    details: '预计处理时间: 1分30秒',
                },
                {
                    id: 9,
                    time: '-',
                    step: '质量检测',
                    status: 'pending' as const,
                    message: '等待视频合成完成',
                    details: '将进行音视频同步检测、画质检测',
                },
            ],
            taskInfo: {
                taskId: convertId,
                name: "这声发布会",
                createTime: '2025-11-28 14:00:00',
                sourceLanguage: '中文（简体）',
                targetLanguage: '英语',
                estimatedTime: '2025-11-28 14:05:30',
                engine: 'AI Engine v2.0',
            },
        };

        setProgressData(mockData);
        setLoading(false);
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="min-w-2/5 max-w-[50vw] h-[80vh] flex flex-col p-0">

                {/* Tab 切换 */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <DialogHeader className="px-6 pt-6 pb-4 shrink-0">
                        <DialogTitle>转换进度【{progressData?.taskInfo?.name}】转换{progressData?.taskInfo?.targetLanguage}</DialogTitle>
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
                                            <CardTitle>转换概览</CardTitle>
                                        </CardHeader>
                                        <CardContent>
                                            <div className="space-y-4">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-muted-foreground">总进度</span>
                                                    <span className="text-2xl font-bold text-primary">
                                                        {progressData.progress}%
                                                    </span>
                                                </div>
                                                <div className="h-2 w-full rounded-full bg-muted">
                                                    <div
                                                        className="h-full rounded-full bg-primary transition-all duration-500"
                                                        style={{ width: `${progressData.progress}%` }}
                                                    ></div>
                                                </div>
                                                <div className="grid grid-cols-3 gap-4 pt-4">
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">已完成</p>
                                                        <p className="text-xl font-semibold text-green-600">
                                                            {progressData.completed}
                                                        </p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">进行中</p>
                                                        <p className="text-xl font-semibold text-orange-500">
                                                            {progressData.processing}
                                                        </p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">等待中</p>
                                                        <p className="text-xl font-semibold text-gray-400">
                                                            {progressData.pending}
                                                        </p>
                                                    </div>
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
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">任务ID</p>
                                                        <p className="font-medium">{progressData.taskInfo.taskId}</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">创建时间</p>
                                                        <p className="font-medium">{progressData.taskInfo.createTime}</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">源语言</p>
                                                        <p className="font-medium">{progressData.taskInfo.sourceLanguage}</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">目标语言</p>
                                                        <p className="font-medium">{progressData.taskInfo.targetLanguage}</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">预计完成时间</p>
                                                        <p className="font-medium">{progressData.taskInfo.estimatedTime}</p>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-muted-foreground">处理引擎</p>
                                                        <p className="font-medium">{progressData.taskInfo.engine}</p>
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

                                                {progressData.logs.map((log) => (
                                                    <div key={log.id} className="relative flex gap-2">
                                                        {/* 状态图标 */}
                                                        <div className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border-2 bg-background">
                                                            {log.status === 'completed' && (
                                                                <CheckCircle2 className="size-5 text-green-600" />
                                                            )}
                                                            {log.status === 'processing' && (
                                                                <Loader2 className="size-5 animate-spin text-orange-500" />
                                                            )}
                                                            {log.status === 'pending' && (
                                                                <Clock className="size-5 text-gray-400" />
                                                            )}
                                                        </div>

                                                        {/* 日志内容 */}
                                                        <div className="flex-1 pb-2">
                                                            <div
                                                                className={cn(
                                                                    'rounded-lg border p-4 transition-all',
                                                                    log.status === 'completed' && 'border-green-300',
                                                                    log.status === 'processing' && 'border-orange-300',
                                                                    log.status === 'pending' && 'border-gray-300'
                                                                )}
                                                            >
                                                                <div className="flex items-start justify-between gap-4">
                                                                    <div className="flex-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <h4 className="font-semibold">{log.step}</h4>
                                                                            <span
                                                                                className={cn(
                                                                                    'rounded-full px-2 py-0.5 text-xs font-medium',
                                                                                    log.status === 'completed' &&
                                                                                    'bg-green-100 text-green-700',
                                                                                    log.status === 'processing' &&
                                                                                    'bg-orange-100 text-orange-700',
                                                                                    log.status === 'pending' && 'bg-gray-100 text-gray-600'
                                                                                )}
                                                                            >
                                                                                {log.status === 'completed' && '已完成'}
                                                                                {log.status === 'processing' && '进行中'}
                                                                                {log.status === 'pending' && '等待中'}
                                                                            </span>
                                                                        </div>
                                                                        <p className="mt-1 text-sm text-muted-foreground">
                                                                            {log.message}
                                                                        </p>
                                                                        <p className="mt-2 text-xs text-muted-foreground">
                                                                            {log.details}
                                                                        </p>
                                                                    </div>
                                                                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                                                                        {log.time}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
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
