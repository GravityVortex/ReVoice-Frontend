import { vtEditOperation, vtTaskSubtitle } from '@/config/db/schema';
import { db } from '@/core/db';
import { eq, desc, and } from 'drizzle-orm';

export type VtEditOperation = typeof vtEditOperation.$inferSelect;
export type NewVtEditOperation = typeof vtEditOperation.$inferInsert;

export async function insertEditOperation(data: NewVtEditOperation) {
  const [result] = await db().insert(vtEditOperation).values(data).returning();
  return result;
}

export async function findEditOperationById(id: string) {
  const [result] = await db()
    .select()
    .from(vtEditOperation)
    .where(and(eq(vtEditOperation.id, id), eq(vtEditOperation.delStatus, 0)))
    .limit(1);
  return result;
}

export async function findEditOperationByOperationId(operationId: string) {
  const [result] = await db()
    .select()
    .from(vtEditOperation)
    .where(and(
      eq(vtEditOperation.operationId, operationId),
      eq(vtEditOperation.delStatus, 0),
    ))
    .limit(1);
  return result;
}

export async function getEditOperationsByTaskId(taskId: string) {
  return await db()
    .select()
    .from(vtEditOperation)
    .where(and(
      eq(vtEditOperation.taskId, taskId),
      eq(vtEditOperation.delStatus, 0),
    ))
    .orderBy(desc(vtEditOperation.createdAt));
}

/**
 * 原子事务：同时写入字幕数据 + 操作日志
 * 保证两者要么一起成功，要么一起失败
 */
export async function replaceSubtitleDataAndLogTx(
  taskId: string,
  next: { translate: any[]; source: any[] },
  operationLog: NewVtEditOperation,
) {
  return await db().transaction(async (tx) => {
    const updatedAt = new Date();
    const translate = await tx
      .update(vtTaskSubtitle)
      .set({ subtitleData: JSON.stringify(next.translate), updatedAt })
      .where(and(eq(vtTaskSubtitle.taskId, taskId), eq(vtTaskSubtitle.stepName, 'translate_srt')))
      .returning();
    const source = await tx
      .update(vtTaskSubtitle)
      .set({ subtitleData: JSON.stringify(next.source), updatedAt })
      .where(and(eq(vtTaskSubtitle.taskId, taskId), eq(vtTaskSubtitle.stepName, 'gen_srt')))
      .returning();
    await tx.insert(vtEditOperation).values(operationLog);
    return { translate, source };
  });
}

/**
 * 更新回滚状态
 * @param status  0=未回滚  1=已回滚  2=回滚失败(部分恢复)
 */
export async function updateEditOperationRollbackStatus(
  id: string,
  status: number,
  rolledBackBy: string,
) {
  const [result] = await db()
    .update(vtEditOperation)
    .set({
      rollbackStatus: status,
      rolledBackAt: new Date(),
      rolledBackBy,
      updatedAt: new Date(),
      updatedBy: rolledBackBy,
    })
    .where(eq(vtEditOperation.id, id))
    .returning();
  return result;
}
