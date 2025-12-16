import { title } from 'process';
import { and, count, desc, eq } from 'drizzle-orm';

import { db } from '@/core/db';
import { vtFileOriginal } from '@/config/db/schema';

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
  // if(!result) return null;
  // return {
  //   ...result,
  //   // 封面地址：{env}/{userId}/{fileId}/frame_img/image/xxx.jpg
  //   cover_path_name: result.coverR2Key ?
  //       `${result.userId}/${result.id}/${result.coverR2Key}` : '',
  // };
}

export async function updateVtFileOriginal(id: string, data: Partial<NewVtFileOriginal>) {
  const [result] = await db().update(vtFileOriginal)
  .set(data).where(eq(vtFileOriginal.id, id)).returning();
  return result;
}

/**
 * 修改封面和标题
 * @param id
 * @param title
 * @param cover
 * @returns
 */
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

export async function getVtFileOriginalList(userId: string, page = 1, limit = 50) {
  const offset = (page - 1) * limit;
  return await db()
    .select()
    .from(vtFileOriginal)
    .where(and(eq(vtFileOriginal.userId, userId), eq(vtFileOriginal.delStatus, 0)))
    .orderBy(desc(vtFileOriginal.createdAt))
    .limit(limit)
    .offset(offset);
}

export async function getVtFileOriginalTotal(userId: string) {
  const [result] = await db()
    .select({ count: count() })
    .from(vtFileOriginal)
    .where(and(eq(vtFileOriginal.userId, userId), eq(vtFileOriginal.delStatus, 0)));
  return result?.count || 0;
}

export async function deleteFileOriginalById(taskMainId: string) {
  // 更新del_status为1
  await db().update(vtFileOriginal)
  .set({ delStatus: 1 })
  .where(eq(vtFileOriginal.id, taskMainId));
}
