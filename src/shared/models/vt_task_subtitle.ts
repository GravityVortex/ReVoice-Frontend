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

export async function findVtTaskSubtitleByTaskIdAndStepName(taskId: string, stepName: string) {
  const [result] = await db()
    .select()
    .from(vtTaskSubtitle)
    .where(and(
      eq(vtTaskSubtitle.taskId, taskId),
      eq(vtTaskSubtitle.stepName, stepName),
      eq(vtTaskSubtitle.delStatus, 0),
    ))
    .orderBy(desc(vtTaskSubtitle.createdAt))
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


export async function replaceSubtitleDataPairByTaskIdTx(taskId: string, next: { translate: any[]; source: any[] }) {
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
    return { translate, source };
  });
}
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
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(subtitle_data::jsonb) = 'string'
              THEN (subtitle_data #>> '{}')::jsonb
              ELSE subtitle_data::jsonb
            END
          ) elem
        ),
        updated_at = NOW()
        WHERE task_id = ${taskId} AND step_name = ${stepName}
        RETURNING *`
  );
  return result;
}

/**
 * patch字幕数组中的单条记录（按 id 匹配，原子更新，避免并发丢数据）
 * @param taskId 任务ID
 * @param stepName 步骤名
 * @param id 字幕id（例如 0001_00-00-00-000_00-00-04-000）
 * @param patch 需要merge进该item的字段（jsonb "||" 语义：patch覆盖同名key）
 */


export async function updateSingleSubtitleItemById(taskId: string, stepName: string, id: string, updatedItem: any) {
  const result = await db().execute(
    sql`UPDATE vt_task_subtitle
        SET subtitle_data = (
          SELECT jsonb_agg(
            CASE
              WHEN elem->>'id' = ${id} THEN ${JSON.stringify(updatedItem)}::jsonb
              ELSE elem
            END
            ORDER BY ord
          )
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(subtitle_data::jsonb) = 'string'
              THEN (subtitle_data #>> '{}')::jsonb
              ELSE subtitle_data::jsonb
            END
          ) WITH ORDINALITY AS t(elem, ord)
        ),
        updated_at = NOW()
        WHERE task_id = ${taskId} AND step_name = ${stepName}
        RETURNING *`
  );
  return result;
}
export async function patchSubtitleItemById(
  taskId: string,
  stepName: string,
  id: string,
  patch: Record<string, any>,
) {
  const patchObj = patch ?? {};
  const entries = Object.entries(patchObj).filter(([k]) => typeof k === 'string' && k.length > 0);
  if (entries.length === 0) {
    return;
  }

  // Build a nested jsonb_set(...) expression so all values stay parameterized (no SQL injection).
  let expr = sql`elem`;
  for (const [k, v] of entries) {
    // Undefined is not a JSON value; treat as null.
    const vv = typeof v === 'undefined' ? null : v;
    let jsonbValueExpr;
    if (vv === null) {
      // jsonb_set(new_value=NULL) returns SQL NULL, which would nuke the whole object.
      // Use JSON null instead.
      jsonbValueExpr = sql`'null'::jsonb`;
    } else if (typeof vv === 'number') {
      // Store numbers as JSON numbers (not strings).
      jsonbValueExpr = sql`to_jsonb(${vv}::numeric)`;
    } else if (typeof vv === 'boolean') {
      jsonbValueExpr = sql`to_jsonb(${vv}::boolean)`;
    } else {
      // Default: JSON string.
      jsonbValueExpr = sql`to_jsonb(${String(vv)}::text)`;
    }
    expr = sql`jsonb_set(${expr}, ARRAY[${k}]::text[], ${jsonbValueExpr}, true)`;
  }

  const result = await db().execute(
    sql`UPDATE vt_task_subtitle
        SET subtitle_data = (
          SELECT jsonb_agg(
            CASE
              WHEN elem->>'id' = ${id} THEN ${expr}
              ELSE elem
            END
            ORDER BY ord
          )
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(subtitle_data::jsonb) = 'string'
              THEN (subtitle_data #>> '{}')::jsonb
              ELSE subtitle_data::jsonb
            END
          ) WITH ORDINALITY AS t(elem, ord)
        ),
        updated_at = NOW()
        WHERE task_id = ${taskId} AND step_name = ${stepName}
        RETURNING *`
  );
  return result;
}
