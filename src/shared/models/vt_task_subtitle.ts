import { vtTaskSubtitle } from '@/config/db/schema';
import { db } from '@/core/db';
import { eq, desc, and } from 'drizzle-orm';

export type VtTaskSubtitle = typeof vtTaskSubtitle.$inferSelect;
export type NewVtTaskSubtitle = typeof vtTaskSubtitle.$inferInsert;

export async function insertVtTaskSubtitle(data: NewVtTaskSubtitle) {
  const [result] = await db().insert(vtTaskSubtitle).values(data).returning();
  return result;
}

export async function findVtTaskSubtitleById(id: string) {
  const [result] = await db()
    .select()
    .from(vtTaskSubtitle)
    .where(and(eq(vtTaskSubtitle.id, id), eq(vtTaskSubtitle.delStatus, 0)))
    .limit(1);
  return result;
}

export async function updateVtTaskSubtitle(id: string, data: Partial<NewVtTaskSubtitle>) {
  const [result] = await db()
    .update(vtTaskSubtitle)
    .set(data)
    .where(eq(vtTaskSubtitle.id, id))
    .returning();
  return result;
}

export async function getVtTaskSubtitleListByTaskId(taskId: string) {
  return await db()
    .select()
    .from(vtTaskSubtitle)
    .where(and(eq(vtTaskSubtitle.taskId, taskId), eq(vtTaskSubtitle.delStatus, 0)))
    .orderBy(desc(vtTaskSubtitle.createdAt));
}

export async function updateVtTaskSubtitleByTaskId(taskId: string, data: Partial<NewVtTaskSubtitle>) {
  return await db()
    .update(vtTaskSubtitle)
    .set(data)
    .where(eq(vtTaskSubtitle.taskId, taskId))
    .returning();
}
