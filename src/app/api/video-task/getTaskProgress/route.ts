// 前端轮询请求接口
import { respData, respErr } from '@/shared/lib/resp';
import { findVtTaskMainProgressById } from '@/shared/models/vt_task_main';
import { getUserInfo } from '@/shared/models/user';
import { hasPermission } from '@/shared/services/rbac';
import { getTaskProgress } from '@/shared/services/javaService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId') || '';
    const progress = searchParams.get('progress') || 'false';

    if (!taskId) {
      return respErr('taskId is required');
    }

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    // 1. 查询Item
    const taskItem = await findVtTaskMainProgressById(taskId);
    if (!taskItem) {
      return respErr('task not found');
    }
    if (taskItem.userId !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return respErr('no permission');
      }
    }

    let progressList: any = [];
    // 如果progress为true，查询进度列表（转发 Java）
    if (progress === 'true') {
      progressList = await getTaskProgress(taskId);
    }

    // 4. 获取R2前缀URL
    // const preUrl = await getSystemConfigByKey('r2.public.base_url');

    // 返回符合新接口格式的数据
    return Response.json({
      code: 0,
      message: 'ok',
      data: {
        taskItem: taskItem,
        progressList,
      },
    });
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
