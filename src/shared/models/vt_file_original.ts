import { vtFileOriginal } from '@/config/db/schema';
import { db } from '@/core/db';
import { eq, desc, and, count } from 'drizzle-orm';

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
  const [result] = await db()
    .update(vtFileOriginal)
    .set(data)
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
