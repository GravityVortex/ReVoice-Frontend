import { getSystemConfigByKey } from '@/shared/cache/system-config';
import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { getVtFileOriginalList, getVtFileOriginalTotal } from '@/shared/models/vt_file_original';
import { getVtTaskMainListByFileIds } from '@/shared/models/vt_task_main';
import { hasPermission } from '@/shared/services/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const paramUserId = searchParams.get('userId') || '';
    const delFlag = (searchParams.get('delFlag') || 'all') as 'all' | 'noDel';
    const status = searchParams.get('status') || 'all';

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const userId = paramUserId || user.id;
    if (userId !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return respErr('no permission');
      }
    }

    // 1. 查询用户的视频列表
    const videoList = await getVtFileOriginalList(userId, page, limit, delFlag, status);
    const totalCount = await getVtFileOriginalTotal(userId, delFlag, status);
    const totalPages = Math.ceil(totalCount / limit);

    // 2. 生成视频ID数组
    const fileIds = videoList.map(v => v.id);

    // 3. 查询这些视频的任务列表
    const taskList = await getVtTaskMainListByFileIds(fileIds, userId);

    // 4. 按 original_file_id 分组任务到对应视频的 tasks 集合
    const videoListWithTasks = videoList.map(
      video => ({
        ...video,
        tasks: taskList.filter(task => task.originalFileId === video.id),
      }));
    // 5. 获取R2前缀URL
    const preUrl = await getSystemConfigByKey('r2.public.base_url');

    return respData({
      preUrl,
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
