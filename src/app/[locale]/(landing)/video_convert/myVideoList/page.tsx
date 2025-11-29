"use client";

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import VideoList, { VideoListItem } from "@/shared/components/ui/video-list";
import VideoPlayerModal from "@/shared/components/ui/video-player-modal";
import { Button } from "@/shared/components/ui/button";
import { Pagination } from "@/shared/components/ui/pagination-client";
import { ProjectAddConvertModal } from "@/shared/blocks/video-convert/project-add-convert-modal";
import { ConversionProgressModal } from "@/shared/blocks/video-convert/convert-progress-modal";
import { ProjectUpdateModal } from "@/shared/blocks/video-convert/project-update-modal";
import { useAppContext } from "@/shared/contexts/app";

// import { Pagination } from "@/shared/types/blocks/pagination";

export default function VideoConvertPage() {
  const params = useParams();
  const locale = (params?.locale as string) || "zh";
  const router = useRouter();
  const { user } = useAppContext();
  
  const [selectedVideo, setSelectedVideo] = useState<VideoListItem | null>(null);
  const [isPlayerOpen, setIsPlayerOpen] = useState(false);
  const [videoList, setVideoList] = useState<VideoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [pageSize] = useState(6);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  // 转换进度弹框状态
  const [isProgressDialogOpen, setIsProgressDialogOpen] = useState(false);
  const [convertId, setConvertId] = useState<string>("");
  const [activeTabIdx, setActiveTabIdx] = useState<string>("1");
  // 修改弹框
  // const [projectSourceId, setProjectSourceId] = useState<string>("");
  const [projectItem, setProjectItem] = useState<Record<string, any>>({});
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);


  const handlePlayVideo = (item: VideoListItem) => {
    setSelectedVideo(item);
    setIsPlayerOpen(true);
  };
  
  const handleEditClick = (item: VideoListItem, index: number) => {
    console.log("编辑视频转换，handleEditClick--->" + index, item);
    // router.push(`/${locale}/video_convert/update?id=${item.id}`);
    // setProjectItem(videoList[index]);
    setProjectItem(item);
    setIsEditDialogOpen(true);
  };
  // 进入项目详情页
  const handleItemClick = (item: VideoListItem) => {
    console.log("[VideoConvertPage] 点击标题，跳转到项目详情页，ID:", item.id);
    router.push(`/${locale}/video_convert/project_detail/${item.id}`);
  };

  // 查看转换进度
  const onStatusClick = (item: VideoListItem) => {
    console.log("查看转换进度，onStatusClick--->", item);
    setActiveTabIdx("1");
    setConvertId(item.id);
    setIsProgressDialogOpen(true);
  };
  const goAddClick = () => {
    router.push(`/${locale}/video_convert/add`);
  };
  const goAdd2Click = () => {
    setIsAddDialogOpen(true)
  }

  const handleClosePlayer = () => {
    setIsPlayerOpen(false);
    setSelectedVideo(null);
  };

  // 修改项目后更新列表数据
  const onItemUpdateEvent = (changeItem: Record<string, any>) => {
    console.log("VideoConvertPage 接收到的 onItemUpdateEvent changeItem--->", changeItem);
    // 更新视频列表中的对应项
    setVideoList((prevList) =>
      prevList.map((item) =>
        item.id === changeItem.id ? { ...item, ...changeItem } : item
      )
    );
  }

  // 获取视频列表数据
  const doGetVideoListFromNet = async (page: number = currentPage) => {
    try {
      setLoading(true);
      setError("");
      console.log("当前用户--->", user);
      // const user_id = user?.id || "";
      // 暂时查询所有数据
      const user_id = "";
      const url = `/api/video-convert/getlist?userId=${user_id}&page=${page}&limit=${pageSize}`
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
          content: item.content || "",
          videoSize: item.videoSize || 3400000,// 视频大小，单位B
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
  
 

  return (
    <div className="container mx-auto py-0">
      <div className="mb-8 flex justify-between">
        <h1 className="text-3xl font-bold">我的视频转换</h1>
        {/* <Button className="mask-add color-" onClick={goAddClick}>上传</Button> */}
        <Button className="mask-add color-" onClick={goAdd2Click}>上传</Button>
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
            onEditClick={handleEditClick}
            onItemClick={handleItemClick}
            onVideoPlay={handlePlayVideo}
            onStatusClick={onStatusClick}
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

      {/* 转换进度弹框 */}
      <ConversionProgressModal
        isOpen={isProgressDialogOpen}
        onClose={() => setIsProgressDialogOpen(false)}
        convertId={convertId}
        activeTabIdx={activeTabIdx}
      />

      {/* 添加视频转换弹框 */}
      <ProjectAddConvertModal
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
      />

      {/* 修改视频转换弹框 */}
      <ProjectUpdateModal
        projectItem={projectItem}
        isOpen={isEditDialogOpen}
        onUpdateEvent={onItemUpdateEvent}
        onClose={() => setIsEditDialogOpen(false)}
      />
    </div>
  );
}
