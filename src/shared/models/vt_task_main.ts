import { vtTaskMain, vtFileOriginal } from '@/config/db/schema';
import { db } from '@/core/db';
import { eq, desc, and, count, inArray } from 'drizzle-orm';
import { progress } from 'framer-motion';

export type VtTaskMain = typeof vtTaskMain.$inferSelect;
export type NewVtTaskMain = typeof vtTaskMain.$inferInsert;

export async function insertVtTaskMain(data: NewVtTaskMain) {
  const [result] = await db().insert(vtTaskMain).values(data).returning();
  return result;
}

export async function findVtTaskMainById(id: string) {
  const [result] = await db()
    .select()
    .from(vtTaskMain)
    .where(and(eq(vtTaskMain.id, id), eq(vtTaskMain.delStatus, 0)))
    .limit(1);
  return result;
}

export async function updateVtTaskMain(id: string, data: Partial<NewVtTaskMain>) {
  const [result] = await db()
    .update(vtTaskMain)
    .set(data)
    .where(eq(vtTaskMain.id, id))
    .returning();
  return result;
}

export async function getVtTaskMainList(userId: string, page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  return await db()
    .select()
    .from(vtTaskMain)
    .where(and(eq(vtTaskMain.userId, userId), eq(vtTaskMain.delStatus, 0)))
    .orderBy(desc(vtTaskMain.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getVtTaskMainTotal(userId: string) {
  const [result] = await db()
    .select({ count: count() })
    .from(vtTaskMain)
    .where(and(eq(vtTaskMain.userId, userId), eq(vtTaskMain.delStatus, 0)));
  return result?.count || 0;
}

export async function getVtTaskMainListByFileId(originalFileId: string) {
  return await db()
    .select()
    .from(vtTaskMain)
    .where(and(eq(vtTaskMain.originalFileId, originalFileId), eq(vtTaskMain.delStatus, 0)))
    .orderBy(desc(vtTaskMain.createdAt));
}

export async function getVtTaskMainListByFileIds(fileIds: string[], userId: string) {
  if (fileIds.length === 0) return [];
  return await db()
    .select({
      id: vtTaskMain.id,
      userId: vtTaskMain.userId,
      status: vtTaskMain.status,
      originalFileId: vtTaskMain.originalFileId,
      priority: vtTaskMain.priority,
      progress: vtTaskMain.progress,
      currentStep: vtTaskMain.currentStep,
      sourceLanguage: vtTaskMain.sourceLanguage,
      targetLanguage: vtTaskMain.targetLanguage,
      speakerCount: vtTaskMain.speakerCount,
      processDurationSeconds: vtTaskMain.processDurationSeconds,
      startedAt: vtTaskMain.startedAt,
      completedAt: vtTaskMain.completedAt,
      createdBy: vtTaskMain.createdBy,
      // delStatus: vtTaskMain.delStatus,
    })
    .from(vtTaskMain)
    .where(
      and(
        eq(vtTaskMain.userId, userId),
        inArray(vtTaskMain.originalFileId, fileIds),
        eq(vtTaskMain.delStatus, 0)
      )
    )
    .orderBy(desc(vtTaskMain.createdAt));
}

/**
 * 连表查询示例
 * @param userId 用户ID
 * @returns 
 */
export async function getVtTaskMainListWithOriginalByUserId(userId: string) {
  return await db()
    .select()
    .from(vtTaskMain)
    .leftJoin(vtFileOriginal, eq(vtTaskMain.originalFileId, vtFileOriginal.id))
    .where(and(eq(vtTaskMain.userId, userId), eq(vtTaskMain.delStatus, 0)))
    .orderBy(desc(vtTaskMain.createdAt));
}

export async function deleteByOriginalFileId(originalFileId: string) {
  await db().delete(vtTaskMain).where(eq(vtTaskMain.originalFileId, originalFileId));
}
