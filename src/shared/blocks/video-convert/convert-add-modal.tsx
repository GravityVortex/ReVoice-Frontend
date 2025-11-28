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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/shared/components/ui/select";
import { useAppContext } from "@/shared/contexts/app";
import { Check, ChevronRight, Languages, Clock, Video, Droplet, BookText} from 'lucide-react';


// 语言选项
const LANGUAGES = [
    { value: 'zh-CN', label: '中文（简体）' },
    { value: 'en-US', label: '英语' },
    { value: 'fr-FR', label: '法语' },
    { value: 'de-DE', label: '德语' },
    { value: 'ja-JP', label: '日语' },
    { value: 'ko-KR', label: '韩语' },
    { value: 'es-ES', label: '西班牙语' },
    { value: 'pt-PT', label: '葡萄牙语' },
];

// 清晰度选项
const RESOLUTIONS = [
    { value: '480p', label: '480P', credits: 10 },
    { value: '720p', label: '720P', credits: 20 },
    { value: '1080p', label: '1080P', credits: 30 },
];

// 水印选项
const WATERMARK_OPTIONS = [
    { value: 'none', label: '无水印', credits: 0 },
    { value: 'with', label: '有水印', credits: 0 },
];

interface FormData {
    targetLanguage: string;
    resolution: string;
    watermark: string;
    remark: string;
}

interface ConvertAddModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectSourceId: string;
}

const STORAGE_KEY = 'convert_add_form_cache';

export function ConvertAddModal({
    isOpen,
    onClose,
    projectSourceId,
}: ConvertAddModalProps) {
    const [currentStep, setCurrentStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const { user } = useAppContext();

    // 模拟视频时长数据（分钟）
    const [videoDuration, setVideoDuration] = useState(0);

    // 表单数据
    const [formData, setFormData] = useState<FormData>({
        targetLanguage: '',
        resolution: '480p',
        watermark: 'none',
        remark: '',
    });


    // 从本地存储加载缓存数据
    useEffect(() => {
        if (isOpen) {
            const cached = localStorage.getItem(STORAGE_KEY);
            if (cached) {
                try {
                    const parsedData = JSON.parse(cached);
                    setFormData(parsedData);
                    console.log('从缓存加载表单数据:', parsedData);
                } catch (e) {
                    console.error('解析缓存数据失败:', e);
                }
            }

            // 模拟获取视频时长（8分钟）
            setTimeout(() => {
                setVideoDuration(8);
                console.log('模拟获取视频时长: 8分钟');
            }, 500);
        }
    }, [isOpen]);

    // 计算消耗积分
    const calculateCredits = () => {
        const resolutionCredits = RESOLUTIONS.find(r => r.value === formData.resolution)?.credits || 0;
        const watermarkCredits = WATERMARK_OPTIONS.find(w => w.value === formData.watermark)?.credits || 0;
        const durationCredits = videoDuration * 2; // 1分钟2积分
        return resolutionCredits + watermarkCredits + durationCredits;
    };

    // 获取时长积分
    const getDurationCredits = () => {
        return videoDuration * 2;
    };

    // 保存到本地缓存
    const saveToCache = () => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(formData));
        console.log('表单数据已缓存');
    };

    // 清除缓存
    const clearCache = () => {
        localStorage.removeItem(STORAGE_KEY);
        console.log('缓存已清除');
    };



    // 处理取消
    const handleCancel = () => {
        saveToCache();
        onClose();
    };

    // 处理下一步
    const handleNext = () => {
        if (!formData.targetLanguage) {
            alert('请选择目标语言');
            return;
        }
        setCurrentStep(2);
    };

    // 处理上一步
    const handlePrevious = () => {
        setCurrentStep(1);
    };

    // 处理提交
    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            const payload = {
                projectSourceId,
                userId: user?.id || '',
                targetLanguage: formData.targetLanguage,
                resolution: formData.resolution,
                watermark: formData.watermark,
                remark: formData.remark,
                credits: calculateCredits(),
            };

            console.log('提交转换任务:', payload);

            // 模拟 API 请求
            await new Promise(resolve => setTimeout(resolve, 1500));

            // 成功后清除缓存
            clearCache();

            // 重置表单
            setFormData({
                targetLanguage: '',
                resolution: '480p',
                watermark: 'none',
                remark: '',
            });
            setCurrentStep(1);

            alert('转换任务已创建！');
            onClose();
        } catch (error) {
            console.error('提交失败:', error);
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
            <DialogContent className="max-w-3xl h-[730px] flex flex-col p-0">
                <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
                    <DialogTitle>新增语种转换</DialogTitle>
                    <DialogDescription className="sr-only">
                        创建新的视频语种转换任务
                    </DialogDescription>

                    {/* 步骤指示器 */}
                    <div className="flex items-center justify-center mt-4 space-x-4">
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
                                配置参数
                            </span>
                        </div>

                        <ChevronRight className="w-5 h-5 text-muted-foreground" />

                        <div className="flex items-center">
                            <div className={cn(
                                "flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all",
                                currentStep === 2 ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30 text-muted-foreground"
                            )}>
                                2
                            </div>
                            <span className={cn(
                                "ml-2 text-sm font-medium",
                                currentStep === 2 ? "text-primary" : "text-muted-foreground"
                            )}>
                                确认提交
                            </span>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-6 pb-0">
                    {/* 第一步：表单填写 */}
                    {currentStep === 1 && (
                        <Card className="mt-2 pt-2 pb-5">
                            <CardContent className="pt-0 space-y-6">
                                {/* 目标语言 */}
                                <div className="flex items-center justify-between gap-3 border-b pb-0 my-0">
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
                                <div className="flex items-center justify-between gap-3 py-3 mb-3 border-b">
                                    <div className="flex items-center gap-3">
                                        {/* <Clock className="w-5 h-5 text-primary" /> */}
                                        <Label className="text-base font-medium whitespace-nowrap">
                                            原视频时长 <span className="text-red-500">*</span>
                                        </Label>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-muted-foreground">
                                            {videoDuration > 0 ? `${videoDuration} 分钟` : '加载中...'}
                                        </span>
                                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                                    </div>
                                </div>

                                {/* 视频清晰度 */}
                                <div className="space-y-2 mb-3">
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
                                <div className="space-y-2 mb-3">
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
                                        转换备注</Label>
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

                    {/* 第二步：确认信息 */}
                    {currentStep === 2 && (
                        <Card className="mt-2 pt-2">
                            <CardContent className="pt-0 space-y-6">
                                <div className="space-y-4">
                                    <h3 className="text-lg font-semibold text-primary">视频转换配置确认</h3>

                                    <div className="mb-0 grid grid-cols-4 gap-4 p-4 bg-muted/30 rounded-lg">
                                        <div className="space-y-1 text-center">
                                            <p className="text-sm text-muted-foreground">目标语言</p>
                                            <p className="font-semibold">{getLanguageLabel(formData.targetLanguage)}</p>
                                        </div>
                                        <div className="space-y-1 text-center">
                                            <p className="text-sm text-muted-foreground">原视频时长</p>
                                            <p className="font-semibold">{videoDuration} 分钟</p>
                                        </div>
                                        <div className="space-y-1 text-center">
                                            <p className="text-sm text-muted-foreground">视频清晰度</p>
                                            <p className="font-semibold">{getResolutionLabel(formData.resolution)}</p>
                                        </div>
                                        <div className="space-y-1 text-center">
                                            <p className="text-sm text-muted-foreground">视频水印</p>
                                            <p className="font-semibold">{getWatermarkLabel(formData.watermark)}</p>
                                        </div>
                                    </div>

                                    {formData.remark && (
                                        <div className="mt-0 p-4 bg-muted/30 rounded-lg">
                                            <p className="text-sm text-muted-foreground mb-2">备注信息</p>
                                            <p className="text-sm">{formData.remark}</p>
                                        </div>
                                    )}

                                    {/* 积分消耗 */}
                                    <div className="p-6 bg-gradient-to-r from-primary/10 to-primary/5 rounded-lg border-2 border-primary/20">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="text-sm text-muted-foreground mb-1">预计消耗积分</p>
                                                <div className="flex items-baseline gap-2">
                                                    <span className="text-4xl font-bold text-primary">{calculateCredits()}</span>
                                                    <span className="text-lg text-muted-foreground">积分</span>
                                                </div>
                                            </div>
                                            <div className="text-right text-sm text-muted-foreground">
                                                <p>视频时长: <span className='text-lg text-red-600'>{getDurationCredits()} </span>积分</p>
                                                <p className='mt-2'>清晰度: <span className='text-lg text-red-600'>{RESOLUTIONS.find(r => r.value === formData.resolution)?.credits} </span>积分</p>
                                                <p className='mt-2'>视频水印: <span className='text-lg text-red-600'>{WATERMARK_OPTIONS.find(w => w.value === formData.watermark)?.credits}</span> 积分</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-5 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                        <p className="text-sm text-blue-800 dark:text-blue-200">
                                            💡 提示：转换任务提交后将在后台处理，预计需要 3-5 分钟完成。
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
                                    onClick={handleNext}
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
