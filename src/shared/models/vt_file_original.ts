import { and, count, desc, eq, inArray } from 'drizzle-orm';

import { db } from '@/core/db';
import { vtFileOriginal, vtTaskMain } from '@/config/db/schema';

export type VtFileOriginal = typeof vtFileOriginal.$inferSelect;
export type NewVtFileOriginal = typeof vtFileOriginal.$inferInsert;

export async function insertVtFileOriginal(data: NewVtFileOriginal) {
  const [result] = await db().insert(vtFileOriginal).values(data).returning();
  return result;
}

export async function findVtFileOriginalById(id: string) {
  const [result] = await db()
    .select()
    .from(vtFileOriginal)
    .where(and(eq(vtFileOriginal.id, id), eq(vtFileOriginal.delStatus, 0)))
    .limit(1);
  return result;
}

export async function updateVtFileOriginal(id: string, data: Partial<NewVtFileOriginal>) {
  const [result] = await db().update(vtFileOriginal)
    .set(data).where(eq(vtFileOriginal.id, id)).returning();
  return result;
}

export async function updateVtFileOriginalCoverTitle(id: string, title: string, coverKey: string, coverSize: number) {
  const [result] = await db()
    .update(vtFileOriginal)
    .set({
      fileName: title,
      coverR2Key: coverKey,
      coverSizeBytes: coverSize,
      coverUpdatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(vtFileOriginal.id, id))
    .returning();
  return result;
}

export async function getVtFileOriginalList(
  userId: string,
  page = 1,
  limit = 50,
  delFlag: 'all' | 'noDel' = 'noDel',
  status?: string
) {
  const offset = (page - 1) * limit;
  let whereConditions = delFlag === 'all'
    ? eq(vtFileOriginal.userId, userId)
    : and(eq(vtFileOriginal.userId, userId), eq(vtFileOriginal.delStatus, 0));

  if (status && status !== 'all') {
    // Filter by task status
    const subQuery = db()
      .select({ id: vtTaskMain.originalFileId })
      .from(vtTaskMain)
      .where(and(
        eq(vtTaskMain.userId, userId),
        eq(vtTaskMain.status, status)
      ));

    whereConditions = and(whereConditions, inArray(vtFileOriginal.id, subQuery));
  }

  return await db()
    .select()
    .from(vtFileOriginal)
    .where(whereConditions)
    .orderBy(desc(vtFileOriginal.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getVtFileOriginalTotal(
  userId: string,
  delFlag: 'all' | 'noDel' = 'noDel',
  status?: string
) {
  let whereConditions = delFlag === 'all'
    ? eq(vtFileOriginal.userId, userId)
    : and(eq(vtFileOriginal.userId, userId), eq(vtFileOriginal.delStatus, 0));

  if (status && status !== 'all') {
    const subQuery = db()
      .select({ id: vtTaskMain.originalFileId })
      .from(vtTaskMain)
      .where(and(
        eq(vtTaskMain.userId, userId),
        eq(vtTaskMain.status, status)
      ));

    whereConditions = and(whereConditions, inArray(vtFileOriginal.id, subQuery));
  }

  const [result] = await db()
    .select({ count: count() })
    .from(vtFileOriginal)
    .where(whereConditions);
  return result?.count || 0;
}

export async function deleteFileOriginalById(taskMainId: string) {
  // 更新del_status为1
  await db().update(vtFileOriginal)
    .set({ delStatus: 1 })
    .where(eq(vtFileOriginal.id, taskMainId));
}

export async function deleteById(id: string) {
  await db().delete(vtFileOriginal).where(eq(vtFileOriginal.id, id));
}
