import { vtFileFinal } from '@/config/db/schema';
import { db } from '@/core/db';
import { eq, desc, and, inArray } from 'drizzle-orm';

export type VtFileFinal = typeof vtFileFinal.$inferSelect;
export type NewVtFileFinal = typeof vtFileFinal.$inferInsert;

export async function getVtFileFinalListByTaskId(taskId: string) {
  return await db()
    .select()
    .from(vtFileFinal)
    .where(and(eq(vtFileFinal.taskId, taskId), eq(vtFileFinal.delStatus, 0)))
    .orderBy(desc(vtFileFinal.createdAt));
}

export async function getVtFileFinalListByTaskIds(taskIds: string[]) {
  return await db()
    .select()
    .from(vtFileFinal)
    .where(and(inArray(vtFileFinal.taskId, taskIds), eq(vtFileFinal.delStatus, 0)))
    .orderBy(desc(vtFileFinal.createdAt));
}
