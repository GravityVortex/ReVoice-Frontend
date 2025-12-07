import { respData, respErr } from '@/shared/lib/resp';
import { findVtFileOriginalById } from '@/shared/models/vt_file_original';
import { getVtTaskMainListByFileIds } from '@/shared/models/vt_task_main';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const fileId = searchParams.get('fileId') || '';

    if (!fileId) {
      return respErr('fileId is required');
    }

    // 1. 查询用户的视频Item
    const videoItem = await findVtFileOriginalById(fileId);

    // 2. 生成视频ID数组
    const fileIds = [videoItem.id];

    // 3. 查询这些视频的任务列表
    const taskList = await getVtTaskMainListByFileIds(fileIds);

    return respData({
      videoItem: videoItem,
      taskList: taskList,
    });

  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
