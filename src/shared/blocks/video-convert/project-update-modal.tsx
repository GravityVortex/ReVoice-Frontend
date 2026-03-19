'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/shared/components/ui/dialog';
import { Label } from "@/shared/components/ui/label";
import { Button } from "@/shared/components/ui/button";
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
    const t = useTranslations('video_convert.projectUpdateModal');
    const [submitting, setSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        title: "",
        cover_url: "",
        cover_key: "",
        cover_size: 0,
    });


    useEffect(() => {
        if (projectItem && isOpen) {
            setFormData({
                title: projectItem.fileName || "",
                cover_size: projectItem.coverSizeBytes || 0,
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
                toast.info(t('messages.saveSuccess'));
                onClose();
            } else {
                console.log("更新失败--->", data);
                // setError(data?.message || "更新视频失败");
                toast.error(t('messages.saveFailed'));
            }
        } catch (error) {
            console.error('提交失败:', error);
            toast.error(t('messages.saveFailed'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription className="sr-only">
                        {t('description')}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2">
                    <div className="space-y-2">
                        <Label>{t('fields.videoCover')}</Label>
                        <ImageUploader
                            allowMultiple={false}
                            maxImages={1}
                            maxSizeMB={3}
                            title=""
                            fileId={projectItem.id}
                            emptyHint={t('fields.coverUploadHint')}
                            defaultPreviews={formData.cover_url ? [formData.cover_url] : []}
                            imageClassName="w-full"
                            aspectRatio="16/9"
                            onChange={(items: ImageUploaderValue[]) => {
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

                    <div className="space-y-2">
                        <Label htmlFor="title">{t('fields.videoName')}</Label>
                        <Input
                            id="title"
                            value={formData.title}
                            onChange={(e) => handleChange("title", e.target.value)}
                            placeholder={t('fields.namePlaceholder')}
                            required
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={handleCancel}>
                        {t('buttons.cancel')}
                    </Button>
                    <Button onClick={handleSubmit} disabled={submitting}>
                        {submitting ? t('buttons.submitting') : t('buttons.save')}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
