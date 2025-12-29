import { vtSystemConfig } from '@/config/db/schema';
import { db } from '@/core/db';
import { eq, and, inArray } from 'drizzle-orm';

export type VtSystemConfig = typeof vtSystemConfig.$inferSelect;
export type NewVtSystemConfig = typeof vtSystemConfig.$inferInsert;

export async function findVtSystemConfigByKey(configKey: string) {
  const [result] = await db()
    .select()
    .from(vtSystemConfig)
    .where(and(eq(vtSystemConfig.configKey, configKey), eq(vtSystemConfig.delStatus, 0)))
    .limit(1);
  return result;
}

export async function getAllVtSystemConfigs() {
  return await db()
    .select()
    .from(vtSystemConfig)
    .where(eq(vtSystemConfig.delStatus, 0));
}

export async function getSystemLimitByIdArr(idArr = [
    'cfg_limit_001',
    'cfg_limit_002',
    'cfg_limit_003',
    'cfg_limit_004',
    'cfg_limit_005',
    'cfg_quota_001',
    'cfg_quota_002',
    'cfg_quota_003',
    'cfg_quota_004',
    'cfg_quota_005',
    'cfg_credit_001',
  ]) {

  return await db()
    .select()
    .from(vtSystemConfig)
    .where(and(inArray(vtSystemConfig.id, idArr), eq(vtSystemConfig.delStatus, 0)));
}

export async function getSystemLimitByConfigKeyArr(keyArr = [
    'quota.guest.credits_per_30d',
    'quota.registered.credits_per_30d',
    'quota.monthly.credits_per_30d',
    'quota.yearly.credits_per_30d',

    'limit.guest.file_size_mb',
    'limit.registered.file_size_mb',
    'limit.monthly.file_size_mb',
    'limit.yearly.file_size_mb',
    
    'credit.points_per_minute',
    'r2.public.base_url',
    'r2.bucket.public',
    'r2.bucket.private',

    'limit.day.video_merge_num',
  ]) {

  return await db()
    .select()
    .from(vtSystemConfig)
    .where(and(inArray(vtSystemConfig.configKey, keyArr), eq(vtSystemConfig.delStatus, 0)));
}
