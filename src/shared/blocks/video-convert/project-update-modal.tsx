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
import { Check, ChevronRight, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/shared/components/ui/input';
import { ImageUploader, ImageUploaderValue } from '@/shared/blocks/common/image-uploader';




interface ProjectUpdateModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectItem: Record<string, any>;
    onUpdateEvent?: (changeItem: Record<string, any>) => void;
}


export function ProjectUpdateModal({
    isOpen,
    onClose,
    projectItem,
    onUpdateEvent
}: ProjectUpdateModalProps) {
    const [currentStep, setCurrentStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const { user } = useAppContext();
    // const [loading, setLoading] = useState(false);

    // 模拟视频时长数据（分钟）
    const [videoDuration, setVideoDuration] = useState(0);

    // 表单数据
    const [formData, setFormData] = useState({
        title: "",
        // description: "",
        // content: "",
        cover_url: "",
        cover_key: "",
        cover_size: 0,
        // source_vdo_url: "",
        // result_vdo_url: "",
        // duration: "",
    });
    // console.log('modal---formData-->', formData)


    useEffect(() => {
        if (projectItem && isOpen) {
            console.log("ProjectUpdateModal 接收到的 projectItem--->", projectItem);
            setFormData({
                title: projectItem.fileName || "",
                cover_size: projectItem.coverSizeBytes || 0,
                // 列表页cover；
                cover_url: projectItem.cover || "",
                cover_key: projectItem.coverR2Key || "",
            });
        }
    }, [projectItem, isOpen]);


    // 处理取消
    const handleCancel = () => {
        onClose();
    };
    const handleChange = (field: string, value: string) => {
        setFormData((prev) => ({ ...prev, [field]: value }));
    };

    // 处理提交
    const handleSubmit = async () => {
        if (!formData.cover_url && !formData.title) {
            onClose();
            return;
        }
        setSubmitting(true);
        try {
            const theItem = {
                id: projectItem.id,
                fileName: formData.title,
                cover_key: formData.cover_key,
                cover_size: formData.cover_size,
            };
            const response = await fetch("/api/video-task/update-video", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(theItem),
            });

            const data = await response.json();
            if (data?.code === 0) {
                console.log("更新成功--->", data.data);
                // 回调更新事件
                onUpdateEvent?.({
                    cover: formData.cover_url,
                    ...theItem
                });
                toast.info('保存修改成功');
                onClose();
            } else {
                console.log("更新失败--->", data);
                // setError(data?.message || "更新视频失败");
                toast.error('提交失败，请重试');
            }
        } catch (error) {
            console.error('提交失败:', error);
            toast.error('提交失败，请重试');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <form onSubmit={handleSubmit} className="space-y-6">
                <DialogContent className="max-w-3/5 h-[580px] flex flex-col p-0">
                    <DialogHeader className="px-6 pt-6 pb-0 shrink-0">
                        <DialogTitle>修改基本信息</DialogTitle>
                        <DialogDescription className="sr-only">
                            修改基本信息
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto px-6 pb-0">
                        <Card className="mt-2 pt-2 pb-5">
                            <CardContent>
                                {/* 封面上传 */}
                                <div className="space-y-3 mt-4">
                                    <Label>视频封面</Label>
                                    <ImageUploader
                                        allowMultiple={false}
                                        maxImages={1}
                                        maxSizeMB={3}
                                        title=""
                                        emptyHint="支持上传图片文件，大小不超过 3MB"
                                        defaultPreviews={formData.cover_url ? [formData.cover_url] : []}
                                        imageClassName="w-full"
                                        aspectRatio="16/9"
                                        onChange={(items: ImageUploaderValue[]) => {
                                            console.log("封面上传结果 items--->", items);
                                            const uploadedItem = items.find(
                                                (item) => item.status === 'uploaded' && item.url
                                            );
                                            setFormData((prev) => ({
                                                ...prev,
                                                cover_url: uploadedItem?.url || '',
                                                cover_key: uploadedItem?.key || '',
                                                cover_size: uploadedItem?.size || 0,
                                            }));
                                        }}
                                    />
                                </div>

                                {/* 视频标题 */}
                                <div className="space-y-3 mt-4">
                                    <Label htmlFor="title">视频名称</Label>
                                    <Input
                                        id="title"
                                        value={formData.title}
                                        onChange={(e) => handleChange("title", e.target.value)}
                                        placeholder="输入视频名称"
                                        required
                                    />
                                </div>

                                {/* 视频描述 */}
                                {/* <div className="space-y-3">
                                    <Label htmlFor="description">视频描述</Label>
                                    <Input
                                        id="description"
                                        value={formData.description}
                                        onChange={(e) => handleChange("description", e.target.value)}
                                        placeholder="输入视频描述"
                                    />
                                </div> */}

                                {/* 视频内容 */}
                                {/* <div className="space-y-3 mt-4">
                                    <Label htmlFor="content">视频内容</Label>
                                    <Textarea
                                        id="content"
                                        value={formData.content}
                                        onChange={(e) => handleChange("content", e.target.value)}
                                        placeholder="输入视频详细内容"
                                        rows={6}
                                    />
                                </div> */}

                            </CardContent>
                        </Card>
                    </div>
                    {/* 底部按钮 */}
                    <div className="shrink-0 border-t px-6 py-4 bg-muted/30">
                        <div className="flex justify-between">
                            <Button
                                variant="outline"
                                onClick={handleCancel}>
                                取消修改
                            </Button>

                            <Button
                                type="submit"
                                onClick={handleSubmit}
                                disabled={submitting} >
                                {/* <Save className="mr-2 size-4" /> */}
                                {submitting ? "提交中..." : "保存修改"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </form>
        </Dialog>
    );
}
