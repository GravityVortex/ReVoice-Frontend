import { respData, respErr } from '@/shared/lib/resp';
import { getVtFileTaskList } from '@/shared/models/vt_file_task';
import { getUserInfo } from '@/shared/models/user';
import { hasPermission } from '@/shared/services/rbac';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId') || undefined;
    const stepName = searchParams.get('stepName') || undefined;
    const requestedUserId = searchParams.get('userId') || undefined;

    const user = await getUserInfo();
    if (!user) {
      return respErr('no auth, please sign in');
    }

    let userId = user.id;
    if (requestedUserId && requestedUserId !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return respErr('no permission');
      }
      userId = requestedUserId;
    }

    const list = await getVtFileTaskList({ taskId, stepName, userId });

    return respData({ list });
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
