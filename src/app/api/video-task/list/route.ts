import { respData, respErr } from '@/shared/lib/resp';
import { getVtFileOriginalList, getVtFileOriginalTotal } from '@/shared/models/vt_file_original';
import { getVtTaskMainListByFileIds } from '@/shared/models/vt_task_main';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const userId = searchParams.get('userId') || '';

    if (!userId) {
      return respErr('userId is required');
    }

    // 1. 查询用户的视频列表
    const videoList = await getVtFileOriginalList(userId, page, limit);
    const totalCount = await getVtFileOriginalTotal(userId);
    const totalPages = Math.ceil(totalCount / limit);

    // 2. 生成视频ID数组
    const fileIds = videoList.map(v => v.id);

    // 3. 查询这些视频的任务列表
    const taskList = await getVtTaskMainListByFileIds(fileIds);

    // 4. 按 original_file_id 分组任务到对应视频的 tasks 集合
    const videoListWithTasks = videoList.map(video => ({
      ...video,
      tasks: taskList.filter(task => task.originalFileId === video.id),
    }));

    return respData({
      list: videoListWithTasks,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
