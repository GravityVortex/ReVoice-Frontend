import { getSystemConfigByKey } from '@/shared/cache/system-config';
import { respData, respErr } from '@/shared/lib/resp';
import { findVtFileOriginalById } from '@/shared/models/vt_file_original';
import { getVtTaskMainListByFileIds } from '@/shared/models/vt_task_main';
import { getVtFileFinalListByTaskIds } from '@/shared/models/vt_file_final';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get('fileId') || '';

    if (!fileId) {
      return respErr('fileId is required');
    }

    // 延迟1秒
    // await new Promise(resolve => setTimeout(resolve, 1500));

    // 1. 查询用户的视频Item
    const videoItem = await findVtFileOriginalById(fileId);

    // 2. 生成视频ID数组
    const fileIds = [videoItem.id];

    // 3. 查询这些视频的任务列表
    const taskList = await getVtTaskMainListByFileIds(fileIds);

    // 3.1 获取任务ID数组
    const taskIdArr = taskList.map((task) => task.id);

    // 4. DOEND：查询任务列表中最终文件vt_file_final(1个task有3个final文件【video/subtitle/preview】)
    const finalFileList = await getVtFileFinalListByTaskIds(taskIdArr);
    // const finalFileList: any[] = [{
    //   id: '1',
    //   taskId: taskList[0].id,
    //   userId: '001',
    //   fileType: 'preview',// 最终预览视频，文件类型:video/subtitle/preview'
    //   fileSizeBytes: 2419199,
    //   r2Key: 'temp_test/test3-final.mp4',
    //   r2Bucket: 'zhesheng',
    //   createdAt: '2025-12-07T11:24:05.135Z',
    //   updatedAt: '2025-12-08T11:24:05.135Z',
    // },
    // {
    //   id: '2',
    //   taskId: taskList[0].id,
    //   userId: '001',
    //   fileType: 'subtitle',// 最终字幕音频，文件类型:video/subtitle/video'
    //   fileSizeBytes: 2419199,
    //   r2Key: 'temp_test/test3-final.wav',
    //   r2Bucket: 'zhesheng',
    //   createdAt: '2025-12-07T11:24:05.135Z',
    //   updatedAt: '2025-12-08T11:24:05.135Z',
    // },
    // {
    //   id: '3',
    //   taskId: taskList[0].id,
    //   userId: '001',
    //   fileType: 'video',// 最终视频，文件类型:video/subtitle/video'
    //   fileSizeBytes: 2419199,
    //   r2Key: 'temp_test/test3-final.mp4',
    //   r2Bucket: 'zhesheng',
    //   createdAt: '2025-12-07T11:24:05.135Z',
    //   updatedAt: '2025-12-08T11:24:05.135Z',
    // }];

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
