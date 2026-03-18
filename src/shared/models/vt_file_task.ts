import { vtFileTask } from '@/config/db/schema';
import { db } from '@/core/db';
import { eq, desc, and, inArray } from 'drizzle-orm';

export type VtFileTask = typeof vtFileTask.$inferSelect;
export type NewVtFileTask = typeof vtFileTask.$inferInsert;

const vtFileTaskSelectFields = {
  id: vtFileTask.id,
  taskId: vtFileTask.taskId,
  userId: vtFileTask.userId,
  stepName: vtFileTask.stepName,
  fileKey: vtFileTask.fileKey,
  r2Key: vtFileTask.r2Key,
  r2Bucket: vtFileTask.r2Bucket,
  expiresAt: vtFileTask.expiresAt,
  createdBy: vtFileTask.createdBy,
  createdAt: vtFileTask.createdAt,
  updatedBy: vtFileTask.updatedBy,
  updatedAt: vtFileTask.updatedAt,
  delStatus: vtFileTask.delStatus,
};

export async function getVtFileTaskList(params: {
  taskId?: string;
  stepName?: string;
  userId?: string;
}) {
  const conditions = [eq(vtFileTask.delStatus, 0)];

  if (params.taskId) {
    conditions.push(eq(vtFileTask.taskId, params.taskId));
  }
  if (params.stepName) {
    conditions.push(eq(vtFileTask.stepName, params.stepName));
  }
  if (params.userId) {
    conditions.push(eq(vtFileTask.userId, params.userId));
  }

  return await db()
    .select(vtFileTaskSelectFields)
    .from(vtFileTask)
    .where(and(...conditions))
    .orderBy(desc(vtFileTask.createdAt));
}

export async function getVtFileTaskListByTaskId(taskId: string, stepNameArr?: string[]) {
  const conditions = [
    eq(vtFileTask.taskId, taskId),
    eq(vtFileTask.delStatus, 0)
  ];

  if (stepNameArr && stepNameArr.length > 0) {
    conditions.push(inArray(vtFileTask.stepName, stepNameArr));
  }

  return await db()
    .select({
      taskId: vtFileTask.taskId,
      stepName: vtFileTask.stepName,
      r2Key: vtFileTask.r2Key,
      createdAt: vtFileTask.createdAt
    })
    .from(vtFileTask)
    .where(and(...conditions))
    .orderBy(desc(vtFileTask.createdAt));
}

export async function findVtFileTaskByTaskIdAndR2Key(taskId: string, r2Key: string) {
  const rows = await db()
    .select(vtFileTaskSelectFields)
    .from(vtFileTask)
    .where(
      and(
        eq(vtFileTask.taskId, taskId),
        eq(vtFileTask.r2Key, r2Key),
        eq(vtFileTask.delStatus, 0)
      )
    )
    .orderBy(desc(vtFileTask.createdAt))
    .limit(1);

  return rows[0] ?? null;
}
