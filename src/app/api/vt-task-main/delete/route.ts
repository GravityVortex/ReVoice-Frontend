import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { findVtTaskMainById, updateVtTaskMain } from '@/shared/models/vt_task_main';
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
    const { id } = body;

    if (!id) {
      return respErr('id is required');
    }

    const task = await findVtTaskMainById(id);
    if (!task) {
      return respErr('Task not found');
    }
    if (task.userId !== user.id) {
      const isAdmin = await hasPermission(user.id, 'admin.access');
      if (!isAdmin) {
        return respErr('no permission');
      }
    }

    const result = await updateVtTaskMain(id, {
      delStatus: 1,
      updatedBy: user.id,
      updatedAt: new Date(),
    });

    if (!result) {
      return respErr('Task not found');
    }

    return respData(result);
  } catch (e) {
    console.log('failed:', e);
    return respErr('failed');
  }
}
