import { getSystemLimitByConfigKeyArr, type VtSystemConfig } from '@/shared/models/vt_system_config';

let cache: VtSystemConfig[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5分钟




export async function getSystemConfigs() {
  const now = Date.now();
  if (cache && now - cacheTime < CACHE_TTL) {
    return cache;
  }

  cache = await getSystemLimitByConfigKeyArr();
  cacheTime = now;
  return cache;
}

export async function getSystemConfigByKey(key: string) {
  const configs = await getSystemConfigs();
  return configs.find(c => c.configKey === key)?.configValue;
}

export function clearCache() {
  cache = null;
  cacheTime = 0;
}
