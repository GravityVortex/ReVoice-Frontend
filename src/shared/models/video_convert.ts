import { video_convert } from "@/config/db/schema";
import { db } from "@/core/db";
import { getUserByUserIds } from "./user";
import { desc, eq, count } from "drizzle-orm";

/**
 * 插入视频转换记录
 * @param data 记录数据
 * @returns 
 */
export async function insertVideoConvert(
  data: typeof video_convert.$inferInsert
): Promise<typeof video_convert.$inferSelect | undefined> {
  const [videoConvert] = await db().insert(video_convert).values(data).returning();

  return videoConvert;
}

/**
 * 根据id查询视频转换记录
 * @param id 记录id
 * @returns 
 */
export async function findVideoConvertById(
  id: number
): Promise<typeof video_convert.$inferSelect | undefined> {
  const [videoConvert] = await db()
    .select()
    .from(video_convert)
    .where(eq(video_convert.id, id))
    .limit(1);

  return videoConvert;
}

/**
 * 更新视频转换记录
 * @param id 记录id
 * @param data 记录数据
 * @returns 
 */
export async function updateVideoConvert(
  id: number,
  data: Partial<typeof video_convert.$inferInsert>
): Promise<typeof video_convert.$inferSelect | undefined> {
  const [videoConvert] = await db()
    .update(video_convert)
    .set(data)
    .where(eq(video_convert.id, id))
    .returning();

  return videoConvert;
}

/**
 * 删除视频转换记录
 * @param id 记录id
 * @returns 
 */
export async function deleteVideoConvert(id: number): Promise<void> {
  await db().delete(video_convert).where(eq(video_convert.id, id));
}

/**
 * 获取视频转换列表
 * @param page 页码
 * @param limit 每页数量
 * @returns 
 */
export async function getVideoConvertList(
  userId: string,
  page: number = 1,
  limit: number = 50
): Promise<(typeof video_convert.$inferSelect)[] | undefined> {
  const offset = (page - 1) * limit;

  const data = await db()
    .select()
    .from(video_convert)
    .where(userId.length == 0 ? undefined : eq(video_convert.user_uuid, userId))
    .orderBy(desc(video_convert.created_at))
    .limit(limit)
    .offset(offset);

  if (!data || data.length === 0) {
    return [];
  }

  // 根据user_uuid查出所有用户
  const user_uuids = Array.from(new Set(data.map((item) => item.user_uuid)));
  // 连表查询，查出用户
  const users = await getUserByUserIds(user_uuids as string[]);
  // 将用户信息添加到视频转换记录中
  return data.map((item) => {
    const user = users?.find((user) => user.id === item.user_uuid);
    return { ...item, user };
  });
}

/**
 * 获取视频转换总数
 * @param userId 用户UUID
 * @returns 总条数
 */
export async function getVideoConvertTotal(
  userId: string, 
): Promise<number> {
  const [result] = await db()
    .select({ count: count() })
    .from(video_convert)
    .where(userId.length == 0 ? undefined : eq(video_convert.user_uuid, userId));

  return result?.count || 0;
}
