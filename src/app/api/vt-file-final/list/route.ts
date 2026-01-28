import { respData, respErr } from '@/shared/lib/resp';
import { getVtFileFinalListByTaskId } from '@/shared/models/vt_file_final';
import { findVtTaskMainById } from '@/shared/models/vt_task_main';
import { getUserInfo } from '@/shared/models/user';
import { hasPermission } from '@/shared/services/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId') || '';

    if (!taskId) {
      return respErr('taskId is required');
    }

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const task = await findVtTaskMainById(taskId);
    if (!task) {
      return respErr('task not found');
    }
    if (task.userId !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return respErr('no permission');
      }
    }

    const list = await getVtFileFinalListByTaskId(taskId, task.userId);

    return respData({ list });
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
