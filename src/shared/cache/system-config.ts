import { getSystemLimitByConfigKeyArr, type VtSystemConfig } from '@/shared/models/vt_system_config';

let cache: VtSystemConfig[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

// 全局配置：Java服务器地址
export const JAVA_SERVER_BASE_URL = process.env.JAVA_SERVER_BASE_URL || 'http://localhost:8080';

// 全局配置：签名URL开关 - true: 调用Java服务器, false: 调用自己的接口
export const USE_JAVA_REQUEST = process.env.USE_JAVA_REQUEST === 'true' || false;




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
