import { getSystemLimitByConfigKeyArr, type VtSystemConfig } from '@/shared/models/vt_system_config';

let cache: VtSystemConfig[] | null = null;
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

// 全局配置：Java服务器地址
export const JAVA_SERVER_BASE_URL = process.env.JAVA_SERVER_BASE_URL || 'http://localhost:8080';
// 调用java接口秘钥
export const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'xxxsecret_zhesheng_!@#$%Bsjaldffads';
// 发送邮件地址
export const JAVA_EMAIL_URL = process.env.JAVA_EMAIL_URL || '';
// 发送邮件秘钥
export const SECRET_EMAIL = process.env.SECRET_EMAIL || '';
// python服务地址
export const PYTHON_SERVER_BASE_URL = process.env.PYTHON_SERVER_BASE_URL || '';
// python秘钥（已废弃，保留兼容）
export const PYTHON_SECRET = process.env.PYTHON_SECRET || '';
// Modal 认证密钥
export const MODAL_KEY = process.env.MODAL_KEY || '';
export const MODAL_SECRET = process.env.MODAL_SECRET || '';

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
  return configs.find((c) => c.configKey === key)?.configValue;
}

export function clearCache() {
  cache = null;
  cacheTime = 0;
}
