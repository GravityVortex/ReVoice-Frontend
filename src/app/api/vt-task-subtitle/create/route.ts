import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { findVtTaskMainById } from '@/shared/models/vt_task_main';
import { insertVtTaskSubtitle } from '@/shared/models/vt_task_subtitle';
import { getUuid } from '@/shared/lib/hash';
import { hasPermission } from '@/shared/services/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    const body = await req.json();
    const { taskId, stepName, subtitleData, subtitleFormat, language } = body;

    if (!taskId || !stepName || !subtitleData) {
      return respErr('Missing required fields');
    }

    const task = await findVtTaskMainById(taskId);
    if (!task) {
      return respErr('Task not found');
    }
    if (task.userId !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return respErr('no permission');
      }
    }

    const result = await insertVtTaskSubtitle({
      id: getUuid(),
      taskId,
      userId: task.userId,
      stepName,
      subtitleData,
      subtitleFormat,
      language,
      createdBy: task.userId,
      updatedBy: task.userId,
    });

    return respData(result);
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
