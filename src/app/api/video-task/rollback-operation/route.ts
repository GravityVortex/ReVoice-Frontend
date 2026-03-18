import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { findVtTaskMainById, updateVtTaskMain } from '@/shared/models/vt_task_main';
import {
  findEditOperationByOperationId,
  getEditOperationsByTaskId,
  updateEditOperationRollbackStatus,
} from '@/shared/models/vt_edit_operation';
import { replaceSubtitleDataPairByTaskIdTx } from '@/shared/models/vt_task_subtitle';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeJsonArray(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const taskId = typeof body?.taskId === 'string' ? body.taskId : '';
    const operationId = typeof body?.operationId === 'string' ? body.operationId : '';

    const user = await getUserInfo();
    if (!user) return respErr('no auth, please sign in');

    if (!taskId || !operationId) {
      return respErr('missing required parameters');
    }

    const task = await findVtTaskMainById(taskId);
    if (!task) return respErr('task not found');
    if (task.userId !== user.id) return respErr('no permission');

    const operation = await findEditOperationByOperationId(operationId);
    if (!operation) return respErr('operation not found');
    if (operation.taskId !== taskId) return respErr('task mismatch');

    // rollback_status: 0=未回滚  1=已回滚  2=回滚失败
    if (operation.rollbackStatus !== 0) return respErr('already rolled back');

    // Stack constraint: only the latest non-rolled-back operation can be undone
    const allOps = await getEditOperationsByTaskId(taskId);
    const latestNonRolledBack = allOps.find((op) => op.rollbackStatus === 0);
    if (!latestNonRolledBack || latestNonRolledBack.operationId !== operationId) {
      return respErr('只能回滚最近一次操作');
    }

    // Restore subtitle data from snapshot
    const snapshotTranslate = normalizeJsonArray(operation.snapshotTranslate);
    const snapshotSource = normalizeJsonArray(operation.snapshotSource);

    await replaceSubtitleDataPairByTaskIdTx(taskId, {
      translate: snapshotTranslate,
      source: snapshotSource,
    });

    // Mark operation as rolled back (status=1)
    await updateEditOperationRollbackStatus(operation.id, 1, user.id);

    // Invalidate merged video metadata so the frontend knows it needs re-merge
    try {
      const currentMeta = typeof task.metadata === 'string'
        ? JSON.parse(task.metadata)
        : (task.metadata || {});
      if (currentMeta.videoMerge) {
        currentMeta.videoMerge.lastSuccess = null;
        currentMeta.videoMerge.active = null;
        await updateVtTaskMain(taskId, {
          metadata: JSON.stringify(currentMeta),
          updatedAt: new Date(),
          updatedBy: user.id,
        });
      }
    } catch (e) {
      console.warn('[rollback] clear videoMerge metadata failed:', e);
    }

    return respData({
      translate: snapshotTranslate,
      source: snapshotSource,
    });
  } catch (error) {
    console.error('rollback operation failed:', error);
    return respErr('rollback operation failed');
  }
}
