import { vtTaskSubtitle } from '@/config/db/schema';
import { db } from '@/core/db';
import { eq, desc, and, inArray, sql } from 'drizzle-orm';

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

export async function getVtTaskSubtitleListByTaskIdAndStepName(taskId: string, stepNameArr: string[]) {
  return await db()
    .select({
      taskId: vtTaskSubtitle.taskId,
      stepName: vtTaskSubtitle.stepName,
      subtitleData: vtTaskSubtitle.subtitleData,
    })
    .from(vtTaskSubtitle)
    .where(and(
      eq(vtTaskSubtitle.taskId, taskId),
      inArray(vtTaskSubtitle.stepName, stepNameArr),
      eq(vtTaskSubtitle.delStatus, 0)
    ))
    .orderBy(desc(vtTaskSubtitle.createdAt));
}

/**
 * 更新字幕大JSON数据
 * @param taskId 任务ID，
 * @param stepName 步骤名，原字幕:gen_srt; 翻译字幕:translate_srt
 * @param subtitleData 字幕大JSON数据
 * @returns
 */
export async function updateSubtitleDataByTaskId(taskId: string, stepName: string, subtitleData: any) {
  return await db()
    .update(vtTaskSubtitle)
    .set({
      subtitleData: JSON.stringify(subtitleData),
      updatedAt: new Date()
    })
    .where(and(eq(vtTaskSubtitle.taskId, taskId), eq(vtTaskSubtitle.stepName, stepName)))
    .returning();
}

/**
 * 更新字幕数组中的单条记录
 * @param taskId 任务ID
 * @param stepName 步骤名
 * @param seq 字幕序号
 * @param updatedItem 更新的字幕项
 * @returns
 */
export async function updateSingleSubtitleItem(taskId: string, stepName: string, seq: string, updatedItem: any) {
  const result = await db().execute(
    sql`UPDATE vt_task_subtitle
        SET subtitle_data = (
          SELECT jsonb_agg(
            CASE
              WHEN elem->>'seq' = ${seq} THEN ${JSON.stringify(updatedItem)}::jsonb
              ELSE elem
            END
          )
          FROM jsonb_array_elements(subtitle_data) elem
        ),
        updated_at = NOW()
        WHERE task_id = ${taskId} AND step_name = ${stepName}
        RETURNING *`
  );
  return result;
}
