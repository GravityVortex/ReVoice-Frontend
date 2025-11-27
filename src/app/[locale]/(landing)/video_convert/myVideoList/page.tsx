"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import VideoList, { VideoListItem } from "@/shared/components/ui/video-list";
import VideoPlayerModal from "@/shared/components/ui/video-player-modal";
import { Button } from "@/shared/components/ui/button";
import { Pagination } from "@/shared/components/ui/pagination-client";
// import { Pagination } from "@/shared/types/blocks/pagination";

export default function VideoConvertPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "zh";
  const router = useRouter();
  
  const [selectedVideo, setSelectedVideo] = useState<VideoListItem | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [videoList, setVideoList] = useState<VideoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize] = useState(6);

  const handlePlayVideo = (item: VideoListItem) => {
    setSelectedVideo(item);
    setIsPlayerOpen(true);
  };
  const goAddClick = () => {
    router.push(`/${locale}/video_convert/add`);
  };

  const handleClosePlayer = () => {
    setIsPlayerOpen(false);
    setSelectedVideo(null);
  };

  // 获取视频列表数据
  const doGetVideoListFromNet = async (page: number = currentPage) => {
    try {
      setLoading(true);
      setError("");
      
      const url = `/api/video-convert/getlist?page=${page}&limit=${pageSize}`
      const response = await fetch(url, {
        method: "GET",
      });
      
      const data = await response.json();
      console.log("视频列表数据:", data);
      
      if (data?.code === 0) {
        const responseData = data.data;
        // 转换数据格式以匹配VideoListItem接口
        const convertedList: VideoListItem[] = (responseData.list || []).map((item: any) => ({
          id: item.id.toString(),
          title: item.title || "未命名视频",
          cover: item.cover_url || "https://picsum.photos/seed/" + item.id + "/640/360",
          videoUrl: item.source_vdo_url || "",
          status: item.status === "created" ? "processing" : item.status,
          duration: item.duration || "0:00",
          convertedAt: new Date(item.created_at).toLocaleString("zh-CN"),
        }));
        
        setVideoList(convertedList);
        
        // 更新分页信息
        if (responseData.pagination) {
          setCurrentPage(responseData.pagination.page);
          setTotalPages(responseData.pagination.totalPages);
          setTotalCount(responseData.pagination.totalCount);
        }
      } else {
        setError(data?.message || "获取视频列表失败");
      }
    } catch (err) {
      console.error("获取视频列表失败:", err);
      setError("获取视频列表失败");
    } finally {
      setLoading(false);
    }
  };

  // 分页处理函数
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages && page !== currentPage) {
      setCurrentPage(page);
      doGetVideoListFromNet(page);
    }
  };

  // 组件挂载时获取数据
  useEffect(() => {
    doGetVideoListFromNet();
  }, []);

  // 这里使用模拟数据展示不同状态（作为备用）
  const itemListDefault: VideoListItem[] = [
    {
      id: "1",
      title: "产品介绍视频 - 2025这声发布会",
      cover: "https://picsum.photos/seed/1/640/360",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      status: "success",
      duration: "5:23",
      convertedAt: "2025-11-15 14:30",
    },
  ];
  
  const items: VideoListItem[] = [
    {
      id: "1",
      title: "产品介绍视频 - 2024新品发布会",
      cover: "https://picsum.photos/seed/1/640/360",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      status: "success",
      duration: "5:23",
      convertedAt: "2024-01-15 14:30",
    },
    {
      id: "2",
      title: "教程视频 - 如何使用AI工具",
      cover: "https://picsum.photos/seed/2/640/360",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
      status: "processing",
      duration: "8:45",
      convertedAt: "2024-01-16 09:15",
    },
    {
      id: "3",
      title: "客户案例分享 - 成功故事",
      cover: "https://picsum.photos/seed/3/640/360",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      status: "success",
      duration: "3:12",
      convertedAt: "2024-01-14 16:20",
    },
    {
      id: "4",
      title: "技术讲解 - 深度学习基础",
      cover: "https://picsum.photos/seed/4/640/360",
      videoUrl: "",
      status: "failed",
      duration: "12:30",
      convertedAt: "2024-01-13 11:45",
    },
    {
      id: "5",
      title: "营销活动视频 - 双十一特惠",
      cover: "https://picsum.photos/seed/5/640/360",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
      status: "success",
      duration: "2:45",
      convertedAt: "2024-01-12 10:00",
    },
    {
      id: "6",
      title: "品牌宣传片 - 企业文化展示",
      cover: "https://picsum.photos/seed/6/640/360",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
      status: "processing",
      duration: "6:18",
      convertedAt: "2024-01-17 08:30",
    },
  ];

  return (
    <div className="container mx-auto py-0">
      <div className="mb-8 flex justify-between">
        <h1 className="text-3xl font-bold">我的视频转换</h1>
        <Button className="mask-add color-" onClick={goAddClick}>上传</Button>
      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="flex justify-center items-center py-12">
          <div className="text-lg">加载中...</div>
        </div>
      )}

      {/* 错误状态 */}
      {error && (
        <div className="flex justify-center items-center py-12">
          <div className="text-red-500 text-lg">{error}</div>
        </div>
      )}

      {/* 视频列表 */}
      {!loading && !error && (
        <>
          <VideoList
            items={videoList.length > 0 ? videoList : itemListDefault}
            cols={3}
            locale={locale}
            onVideoPlay={handlePlayVideo}
          />
          
          {/* 分页组件 - 只在有真实数据时显示 */}
          {videoList.length > 0 && totalPages > 1 && (
            <div className="mt-8 flex justify-end">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalCount={totalCount}
                onPageChange={handlePageChange}
              />
            </div>
          )} 
        </>
      )}

      {/* 视频播放器模态框 */}
      {selectedVideo && (
        <VideoPlayerModal
          isOpen={isPlayerOpen}
          onClose={handleClosePlayer}
          videoUrl={selectedVideo.videoUrl}
          title={selectedVideo.title}
        />
      )}
    </div>
  );
}
