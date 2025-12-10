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
import { envConfigs } from "@/config";

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
  const [taskMainId, setTaskMainId] = useState<string>("");
  const [activeTabIdx, setActiveTabIdx] = useState<string>("1");
  // 修改弹框
  // const [projectSourceId, setProjectSourceId] = useState<string>("");
  const [projectItem, setProjectItem] = useState<Record<string, any>>({});
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [preUrl, setPreUrl] = useState<string>("");

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

    let tempId;
    if (item.tasks && item.tasks.length > 0) {
      if (item.tasks.length === 1) {
        tempId = item.tasks[0].id;
      } else {
        const theIt = item.tasks.find((task: any) => task.status === "processing");
        tempId = theIt ? theIt.id : item.tasks[0].id;
      }
    }
    // 列表页寻找子任务taskMainId
    if (tempId) {
      setTaskMainId(tempId);
      setIsProgressDialogOpen(true);
    }
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

  // 刷新页面
  const onCreateTaskSuccess = () => {
    // setIsAddDialogOpen(false);
    doGetVideoListFromNet();
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
      console.log("list当前用户--->", user);
      const user_id = user?.id || "";
      // 暂时查询所有数据
      // const user_id = "";
      const url = `/api/video-task/list?userId=${user_id}&page=${page}&limit=${pageSize}`
      const response = await fetch(url, {
        method: "GET",
      });

      const data = await response.json();
      console.log("视频列表数据-->", data);
      // {
      //     "id": "8bb54f6e-8572-44f5-a674-ae939b026c63",
      //     "userId": "99a30c57-88c1-4c93-9a4d-cea945a731be",
      //     "fileName": "test3.mp4",
      //     "fileSizeBytes": 2419199,
      //     "fileType": "video/mp4",
      //     "r2Key": "uploads/1765106611963-test3.mp4",
      //     "r2Bucket": "video-store",
      //     "videoDurationSeconds": 65,
      //     "checksumSha256": "",
      //     "uploadStatus": "pending",
      //     "coverR2Key": null,
      //     "coverSizeBytes": null,
      //     "coverUpdatedAt": null,
      //     "createdBy": "99a30c57-88c1-4c93-9a4d-cea945a731be",
      //     "createdAt": "2025-12-07T11:24:05.135Z",
      //     "updatedBy": "99a30c57-88c1-4c93-9a4d-cea945a731be",
      //     "updatedAt": "2025-12-07T11:24:05.135Z",
      //     "delStatus": 0,
      //     "tasks":[
      //               {
      //                 "id": "221e9937-c663-4de0-84ee-32a29aef6da6",
      //                 "userId": "99a30c57-88c1-4c93-9a4d-cea945a731be",
      //                 "originalFileId": "8bb54f6e-8572-44f5-a674-ae939b026c63",
      //                 "status": "pending",
      //                 "priority": 3,
      //                 "progress": 0,
      //                 "currentStep": null,
      //                 "sourceLanguage": "zh-CN",
      //                 "targetLanguage": "en-US",
      //                 "speakerCount": "single",
      //                 "processDurationSeconds": 0,
      //                 "creditId": "61986398-4a24-4650-b0ce-3ba50405dd11",
      //                 "creditsConsumed": 4,
      //                 "errorMessage": null,
      //                 "startedAt": null,
      //                 "completedAt": null,
      //                 "createdBy": "99a30c57-88c1-4c93-9a4d-cea945a731be",
      //                 "createdAt": "2025-12-07T11:24:06.605Z",
      //                 "updatedBy": "99a30c57-88c1-4c93-9a4d-cea945a731be",
      //                 "updatedAt": "2025-12-07T11:24:06.605Z",
      //                 "delStatus": 0
      //               }
      //             ]
      // }

      if (data?.code === 0) {
        const responseData = data.data;
        setPreUrl(responseData.preUrl || "");
        // 转换数据格式以匹配VideoListItem接口
        const convertedList: VideoListItem[] = (responseData.list || []).map((item: any) => {
          // 根据 tasks 确定 status= pending/processing/completed/failed/cancelled'
          let status = "pending";
          if (item.tasks && item.tasks.length > 0) {
            if (item.tasks.length === 1) {
              status = item.tasks[0].status;
            } else {
              const hasProcessing = item.tasks.some((task: any) => task.status === "processing");
              status = hasProcessing ? "processing" : item.tasks[0].status;
            }
          }

          // 转换秒数为 HH:MM:SS 格式
          const seconds = item.videoDurationSeconds || 0;
          const h = Math.floor(seconds / 3600);
          const m = Math.floor((seconds % 3600) / 60);
          const s = seconds % 60;
          const duration = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;

          return {
            ...item,
            // id: item.id.toString(),
            fileName: item.fileName || "未命名视频",
            // coverR2Key: item.coverR2Key,
            // coverSize: item.coverSizeBytes,
            // ("https://picsum.photos/seed/" + item.id + "/640/360")
            cover: item.coverR2Key? (responseData.preUrl + '/' + item.coverR2Key) : '',
            videoUrl: item.r2Key || "",
            status,
            duration,
            convertedAt: new Date(item.createdAt).toLocaleString("zh-CN"),
            videoSize: item.fileSizeBytes || 3400000,
            tasks: item.tasks,// 任务列表
          };
        });

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
      status: "completed",
      duration: "5:23",
      convertedAt: "2025-11-15 14:30",
      videoSize: 52300000,
      tasks: []
    },
  ];



  return (
    <div className="container mx-auto py-0">
      <div className="mb-8 flex justify-between">
        <h1 className="text-3xl font-bold">我的视频转换</h1>
        {/* <Button className="mask-add color-" onClick={goAddClick}>上传</Button> */}
        <Button className="mask-add text-white" onClick={goAdd2Click}>上传</Button>
      </div>

      {/* 加载状态龙骨状态 */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-pulse">
          {[...Array(6)].map((_, index) => (
            <div key={index} className="border-2 rounded-lg overflow-hidden bg-card">
              {/* 视频封面骨架 */}
              <div className="aspect-video bg-muted border-b-2"></div>

              {/* 内容区域骨架 */}
              <div className="px-4 py-4 pt-2 space-y-3 mt-2">
                {/* 标题 */}
                <div className="h-5 w-3/4 bg-muted rounded border"></div>

                {/* 状态和时长 */}
                <div className="flex justify-between gap-2">
                  <div className="h-5 w-full bg-muted rounded border"></div>
                  <div className="h-5 w-full bg-muted rounded border"></div>
                </div>

                {/* 转换时间 */}
                {/* <div className="h-4 w-32 bg-muted rounded border"></div> */}

                {/* 按钮组 */}
                <div className="">
                  <div className="h-5 w-full flex-1 bg-muted rounded border"></div>
                </div>
              </div>
            </div>
          ))}
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
        taskMainId={taskMainId}
        activeTabIdx={activeTabIdx}
      />

      {/* 添加视频转换弹框 */}
      <ProjectAddConvertModal
        isOpen={isAddDialogOpen}
        onClose={() => setIsAddDialogOpen(false)}
        onCreateTaskSuccess={onCreateTaskSuccess}
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
