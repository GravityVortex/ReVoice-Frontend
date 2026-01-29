"use client";

import React, { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useRouter } from "@/core/i18n/navigation";
import { useTranslations } from "next-intl";
import VideoList, { VideoListItem } from "@/shared/components/ui/video-list";
import VideoPlayerModal from "@/shared/components/ui/video-player-modal";
import { Button } from "@/shared/components/ui/button";
import { Pagination } from "@/shared/components/ui/pagination-client";
import { ConversionProgressModal } from "@/shared/blocks/video-convert/convert-progress-modal";
import { ProjectUpdateModal } from "@/shared/blocks/video-convert/project-update-modal";
import { useAppContext } from "@/shared/contexts/app";
import { getPreviewCoverUrl, getVideoR2PathName } from "@/shared/lib/utils";

import { SlidingTabs } from "@/shared/components/ui/sliding-tabs";
import { PlusCircle } from "lucide-react";

export default function DashboardProjectsPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const locale = (params?.locale as string) || "zh";
    const router = useRouter();
    const { user } = useAppContext();
    const t = useTranslations('video_convert.myVideoList');
    // Use separate translation namespace for dashboard titles if needed, or fallback
    const tDashboard = useTranslations('common.dashboard.sidebar');

    const [selectedVideo, setSelectedVideo] = useState<VideoListItem | null>(null);
    const [isPlayerOpen, setIsPlayerOpen] = useState(false);
    const [videoList, setVideoList] = useState<VideoListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string>("");
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [pageSize] = useState(6);
    const [isProgressDialogOpen, setIsProgressDialogOpen] = useState(false);
    const [taskMainId, setTaskMainId] = useState<string>("");
    const [activeTabIdx, setActiveTabIdx] = useState<string>("1");
    const [projectItem, setProjectItem] = useState<Record<string, any>>({});
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [, setPreUrl] = useState<string>("");
    const [statusFilter, setStatusFilter] = useState("all");

    // Auto-redirect to create page if query param is set
    useEffect(() => {
        if (searchParams.get('open') === 'create') {
            router.replace('/dashboard/create');
        }
    }, [searchParams, router]);

    const handlePlayVideo = (item: VideoListItem) => {
        const len = item.tasks?.length || 0;
        if (item.status === "completed" && len > 0) {
            item.videoUrl = getVideoR2PathName(
                user?.id || "", item.tasks?.[len - 1].id || '', 'merge_audio_video/video/video_new.mp4'
            )
        }
        setSelectedVideo(item);
        setIsPlayerOpen(true);
    };

    const handleEditClick = (item: VideoListItem) => {
        setProjectItem(item);
        setIsEditDialogOpen(true);
    };

    const handleItemClick = (item: VideoListItem) => {
        router.push(`/dashboard/projects/${item.id}`);
    };

    const onStatusClick = (item: VideoListItem) => {
        setActiveTabIdx("1");
        let tempId;
        if (item.tasks && item.tasks.length > 0) {
            if (item.tasks.length === 1) {
                tempId = item.tasks[0].id;
            } else {
                const theIt = item.tasks.find((task: any) => task.status === "processing");
                tempId = theIt ? theIt.id : item.tasks[0].id;
            }
        }
        if (tempId) {
            setTaskMainId(tempId);
            setIsProgressDialogOpen(true);
        }
    };

    const goAddClick = () => {
        router.push('/dashboard/create');
    };

    const handleClosePlayer = () => {
        setIsPlayerOpen(false);
        setSelectedVideo(null);
    };

    const onItemUpdateEvent = (changeItem: Record<string, any>) => {
        setVideoList((prevList) =>
            prevList.map((item) =>
                item.id === changeItem.id ? { ...item, ...changeItem } : item
            )
        );
    }

    const doGetVideoListFromNet = async (page: number = currentPage) => {
        try {
            setLoading(true);
            setError("");
            const user_id = user?.id || "";
            let url = `/api/video-task/list?userId=${user_id}&page=${page}&limit=${pageSize}`;
            // If API supports status filter, append it here. 
            // For restoration, I'll filter client-side below for safety if API is unknown, 
            // OR if I am sure API supports it.
            // Given I don't see API code, I will filter client side or assume no server filter for now to avoid errors.

            const response = await fetch(url, { method: "GET" });
            const data = await response.json();

            if (data?.code === 0) {
                const responseData = data.data;
                setPreUrl(responseData.preUrl || "");
                const convertedList: VideoListItem[] = (responseData.list || []).map((item: any) => {
                    let status = "pending";
                    if (item.tasks && item.tasks.length > 0) {
                        if (item.tasks.length === 1) {
                            status = item.tasks[0].status;
                        } else {
                            const hasProcessing = item.tasks.some((task: any) => task.status === "processing");
                            status = hasProcessing ? "processing" : item.tasks[0].status;
                        }
                    }

                    const seconds = item.videoDurationSeconds || 0;
                    const h = Math.floor(seconds / 3600);
                    const m = Math.floor((seconds % 3600) / 60);
                    const s = seconds % 60;
                    const duration = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

                    return {
                        ...item,
                        fileName: item.fileName || "Untitled",
                        cover: getPreviewCoverUrl(item, responseData.preUrl),
                        videoUrl: item.r2Key ? getVideoR2PathName(item.userId, item.id, item.r2Key) : "",
                        status,
                        duration,
                        convertedAt: new Date(item.createdAt).toLocaleString(locale === 'zh' ? "zh-CN" : "en-US"),
                        videoSize: item.fileSizeBytes || 0,
                        tasks: item.tasks,
                    };
                });
                setVideoList(convertedList);

                if (responseData.pagination) {
                    setCurrentPage(responseData.pagination.page);
                    setTotalPages(responseData.pagination.totalPages);
                    setTotalCount(responseData.pagination.totalCount);
                }
            } else {
                setError(data?.message || t('error'));
            }
        } catch (err) {
            console.error("Fetch error:", err);
            setError(t('error'));
        } finally {
            setLoading(false);
        }
    };

    const handlePageChange = (page: number) => {
        if (page >= 1 && page <= totalPages && page !== currentPage) {
            setCurrentPage(page);
            doGetVideoListFromNet(page);
        }
    };

    useEffect(() => {
        doGetVideoListFromNet();
    }, []);

    // Filter list based on status
    const filteredList = videoList.filter(item => {
        if (statusFilter === "all") return true;
        return item.status === statusFilter;
    });

    return (
        <div className="container mx-auto py-8">
            <div className="flex flex-col gap-6 mb-8">
                <div className="flex justify-between items-center">
                    <h1 className="text-3xl font-bold">{tDashboard('projects')}</h1>
                    <Button onClick={goAddClick} size="lg" className="shadow-lg hover:shadow-xl transition-all">
                        <PlusCircle className="mr-2 h-5 w-5" />
                        {t('buttons.upload')}
                    </Button>
                </div>

                <SlidingTabs
                    tabs={[
                        { id: "all", label: t('status.all') || "All" },
                        { id: "processing", label: t('status.processing') || "Processing" },
                        { id: "completed", label: t('status.completed') || "Completed" },
                        { id: "failed", label: t('status.failed') || "Failed" },
                    ]}
                    activeTab={statusFilter}
                    onChange={(id) => setStatusFilter(id)}
                    className=""
                />
            </div>

            {loading && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
                    {[...Array(6)].map((_, index) => (
                        <div key={index} className="flex flex-col gap-3 rounded-2xl bg-card p-3 border border-border/50 shadow-sm">
                            {/* Thumbnail Skeleton */}
                            <div className="relative aspect-video w-full overflow-hidden rounded-xl bg-muted">
                                <div className="absolute top-2 right-2 w-16 h-6 bg-background/50 rounded-full"></div>
                                <div className="absolute bottom-2 right-2 w-10 h-4 bg-background/50 rounded"></div>
                            </div>

                            {/* Info Section Skeleton */}
                            <div className="flex flex-col gap-1 px-1">
                                <div className="flex items-start justify-between gap-2">
                                    <div className="h-5 w-3/4 bg-muted rounded"></div>
                                    <div className="h-6 w-6 bg-muted rounded-full"></div>
                                </div>
                                <div className="flex items-center gap-4 mt-1">
                                    <div className="h-3 w-16 bg-muted rounded"></div>
                                    <div className="h-3 w-12 bg-muted rounded"></div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {error && (
                <div className="flex justify-center items-center py-12">
                    <div className="text-destructive text-lg">{error}</div>
                </div>
            )}

            {!loading && !error && (
                <>
                    <VideoList
                        items={filteredList}
                        cols={3}
                        locale={locale}
                        onEditClick={handleEditClick}
                        onItemClick={handleItemClick}
                        onVideoPlay={handlePlayVideo}
                        onStatusClick={onStatusClick}
                    />

                    {filteredList.length > 0 && totalPages > 1 && (
                        <div className="mt-8 flex justify-end">
                            <Pagination
                                currentPage={currentPage}
                                totalPages={totalPages}
                                totalCount={totalCount}
                                onPageChange={handlePageChange}
                            />
                        </div>
                    )}

                    {filteredList.length === 0 && (
                        <div className="text-center py-20 text-muted-foreground bg-muted/30 rounded-xl border border-dashed">
                            <p>{t('noData') || "No projects found"}</p>
                            {statusFilter === 'all' && (
                                <Button variant="link" onClick={goAddClick} className="mt-2 text-primary">
                                    {t('buttons.upload')}
                                </Button>
                            )}
                        </div>
                    )}
                </>
            )}

            {selectedVideo && (
                <VideoPlayerModal
                    isOpen={isPlayerOpen}
                    onClose={handleClosePlayer}
                    videoUrl={selectedVideo.videoUrl}
                    title={selectedVideo.fileName}
                />
            )}

            <ConversionProgressModal
                isOpen={isProgressDialogOpen}
                onClose={() => setIsProgressDialogOpen(false)}
                taskMainId={taskMainId}
                activeTabIdx={activeTabIdx}
            />

            <ProjectUpdateModal
                projectItem={projectItem}
                isOpen={isEditDialogOpen}
                onUpdateEvent={onItemUpdateEvent}
                onClose={() => setIsEditDialogOpen(false)}
            />
        </div>
    );
}
