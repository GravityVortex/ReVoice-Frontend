import { respData, respErr } from '@/shared/lib/resp';
import { getUserInfo } from '@/shared/models/user';
import { findVtTaskMainById, updateVtTaskMain } from '@/shared/models/vt_task_main';
import {
  findEditOperationByOperationId,
  getEditOperationsByTaskId,
  updateEditOperationRollbackStatus,
} from '@/shared/models/vt_edit_operation';
import {
  findVtTaskSubtitleByTaskIdAndStepName,
  replaceSubtitleDataPairByTaskIdTx,
} from '@/shared/models/vt_task_subtitle';
import { reindexSeqInPlace } from '@/shared/lib/timeline/split';

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

function incrementalSplitRollback(
  currentArr: any[],
  childIds: string[],
  parentRow: any,
): any[] {
  const firstChildIdx = currentArr.findIndex((r) => childIds.includes(r?.id));
  const filtered = currentArr.filter((r) => !childIds.includes(r?.id));
  const insertAt = firstChildIdx >= 0 ? firstChildIdx : filtered.length;
  filtered.splice(insertAt, 0, parentRow);
  reindexSeqInPlace(filtered);
  return filtered;
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

    if (operation.rollbackStatus !== 0) return respErr('already rolled back');

    const allOps = await getEditOperationsByTaskId(taskId);
    const latestNonRolledBack = allOps.find((op) => op.rollbackStatus === 0);
    if (!latestNonRolledBack || latestNonRolledBack.operationId !== operationId) {
      return respErr('只能回滚最近一次操作');
    }

    const detail = operation.operationDetail as any;
    const result = operation.resultDetail as any;
    const canIncrementalRollback =
      detail?.parentTranslateRow && detail?.parentSourceRow && result?.newIds;

    let nextTranslate: any[];
    let nextSource: any[];

    if (canIncrementalRollback) {
      const translateRow = await findVtTaskSubtitleByTaskIdAndStepName(taskId, 'translate_srt');
      const sourceRow = await findVtTaskSubtitleByTaskIdAndStepName(taskId, 'gen_srt');
      const currentTranslate = normalizeJsonArray((translateRow as any)?.subtitleData);
      const currentSource = normalizeJsonArray((sourceRow as any)?.subtitleData);

      const { leftTranslateId, rightTranslateId, leftSourceId, rightSourceId } = result.newIds;

      nextTranslate = incrementalSplitRollback(
        currentTranslate,
        [leftTranslateId, rightTranslateId],
        detail.parentTranslateRow,
      );
      nextSource = incrementalSplitRollback(
        currentSource,
        [leftSourceId, rightSourceId],
        detail.parentSourceRow,
      );
    } else {
      nextTranslate = normalizeJsonArray(operation.snapshotTranslate);
      nextSource = normalizeJsonArray(operation.snapshotSource);
    }

    await replaceSubtitleDataPairByTaskIdTx(taskId, {
      translate: nextTranslate,
      source: nextSource,
    });

    await updateEditOperationRollbackStatus(operation.id, 1, user.id);

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
      translate: nextTranslate,
      source: nextSource,
    });
  } catch (error) {
    console.error('rollback operation failed:', error);
    return respErr('rollback operation failed');
  }
}
