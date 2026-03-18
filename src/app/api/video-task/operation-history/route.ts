import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { findVtTaskMainById } from '@/shared/models/vt_task_main';
import { getEditOperationsByTaskId } from '@/shared/models/vt_edit_operation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const taskId = searchParams.get('taskId') || '';

    const user = await getUserInfo();
    if (!user) return respErr('no auth, please sign in');

    if (!taskId) {
      return respErr('missing taskId parameter');
    }

    const task = await findVtTaskMainById(taskId);
    if (!task) return respErr('task not found');
    if (task.userId !== user.id) return respErr('no permission');

    const operations = await getEditOperationsByTaskId(taskId);

    return respData(
      operations.map((op) => ({
        id: op.id,
        operationType: op.operationType,
        operationId: op.operationId,
        operationDetail: op.operationDetail,
        rollbackStatus: op.rollbackStatus,
        createdAt: op.createdAt,
        rolledBackAt: op.rolledBackAt,
      }))
    );
  } catch (error) {
    console.error('get operation history failed:', error);
    return respErr('get operation history failed');
  }
}
