import { getSystemConfigByKey } from '@/shared/cache/system-config';
import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { findVtFileOriginalById } from '@/shared/models/vt_file_original';
import { getVtTaskMainListByFileIds } from '@/shared/models/vt_task_main';
import { getVtFileFinalListByTaskIds } from '@/shared/models/vt_file_final';
import { hasPermission } from '@/shared/services/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get('fileId') || '';

    if (!fileId) {
      return respErr('fileId is required');
    }

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    // 延迟1秒
    // await new Promise(resolve => setTimeout(resolve, 1500));

    // 1. 查询用户的视频Item
    const videoItem = await findVtFileOriginalById(fileId);
    if (!videoItem) {
      return respErr('video not found');
    }
    if (videoItem.userId !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return respErr('no permission');
      }
    }

    // 2. 生成视频ID数组
    const fileIds = [videoItem.id];

    // 3. 查询这些视频的任务列表
    const taskList = await getVtTaskMainListByFileIds(fileIds, videoItem.userId);

    // 3.1 获取任务ID数组
    const taskIdArr = taskList.map((task) => task.id);

    // 4. DOEND：查询任务列表中最终文件vt_file_final(1个task有3个final文件【video/subtitle/preview】)
    const finalFileList =
      taskIdArr.length > 0 ? await getVtFileFinalListByTaskIds(taskIdArr) : [];
    // const finalFileList: any[] = [
    //   {
    //     "taskId": "task6",
    //     "fileType": "preview",
    //     "r2Key": "preview/video/video_new_preview.mp4",
    //     "r2Bucket": "zhesheng"
    //   },
    //   {
    //     "taskId": "task6",
    //     "fileType": "video", // 最终视频，文件类型:video/subtitle/video'
    //     "r2Key": "merge_audio_video/video/video_new.mp4",
    //     "r2Bucket": "zhesheng"
    //   },
    //   // {
    //   //   taskId: taskList[0].id,
    //   //   fileType: 'subtitle',
    //   //   r2Key: 'temp_test/test3-final.mp4',
    //   //   r2Bucket: 'zhesheng',
    //   // }
    // ];

    // 4.1 将finalFileList筛选放到taskList中
    const finalTaskList = taskList.map((task) => {
      return {
        ...task,
        finalFileList: finalFileList.filter((finalFile: any) => finalFile.taskId === task.id),
      };
    });

    // 5. 获取R2前缀URL
    const preUrl = await getSystemConfigByKey('r2.public.base_url');

    return respData({
      preUrl,
      videoItem: videoItem,
      taskList: finalTaskList,
    });

  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
