'use client';

import FingerprintJS from '@fingerprintjs/fingerprintjs';

let fpPromise: Promise<any> | null = null;

// Cookie 名称常量
const VISITOR_ID_COOKIE = 'visitor_id';
const DEVICE_ID_STORAGE = 'device_id';

/**
 * 从 cookie 中获取访客 ID
 */
function getVisitorIdFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(^| )${VISITOR_ID_COOKIE}=([^;]+)`));
  return match ? match[2] : null;
}

/**
 * 设置访客 ID 到 cookie（1年有效期）
 */
function setVisitorIdToCookie(visitorId: string): void {
  if (typeof document === 'undefined') return;
  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);
  document.cookie = `${VISITOR_ID_COOKIE}=${visitorId};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

/**
 * 从 localStorage 获取设备 ID
 */
function getDeviceIdFromStorage(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(DEVICE_ID_STORAGE);
  } catch {
    return null;
  }
}

/**
 * 保存设备 ID 到 localStorage
 */
function setDeviceIdToStorage(deviceId: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(DEVICE_ID_STORAGE, deviceId);
  } catch {
    // localStorage 可能被禁用，忽略错误
  }
}

/**
 * 生成基于硬件的稳定指纹（只使用跨浏览器一致的组件）
 * 
 * 策略：只使用真正跨浏览器一致的组件
 * 
 * 经过实际测试，以下组件在 Chrome 和 Safari 中是一致的：
 * - timezone: 时区
 * - platform: 平台（MacIntel）
 * - touchSupport: 触摸支持
 * 
 * 以下组件在不同浏览器中不一致（已排除）：
 * - screenResolution: Safari 不返回值
 * - screenFrame: Chrome 和 Safari 不同
 * - colorDepth: Chrome 30位，Safari 24位
 * - hardwareConcurrency: Chrome 12核，Safari 8核（Safari 限制报告）
 * - deviceMemory: Safari 不返回值
 * - languages: Safari 会重复值
 * - audio, canvas, fonts, webGl: 完全不同
 */
async function generateStableFingerprint(): Promise<string> {
  const fp = await getFingerprintAgent();
  const result = await fp.get();

  // 排除不稳定的组件：audio, canvas, fonts, plugins
  const {
    audio,
    canvas,
    fonts,
    plugins,
    ...stableComponents
  } = result.components;
  
  // 只保留真正跨浏览器一致的组件
  // const stableComponents: Record<string, any> = {};
  
  // // 1. 时区（地理位置相关，跨浏览器一致）
  // if (result.components.timezone?.value) {
  //   stableComponents.timezone = result.components.timezone;
  // }
  
  // // 2. 平台信息（操作系统，跨浏览器一致）
  // if (result.components.platform?.value) {
  //   stableComponents.platform = result.components.platform;
  // }
  
  // // 3. 触摸支持（硬件特征，跨浏览器一致）
  // if (result.components.touchSupport?.value) {
  //   stableComponents.touchSupport = result.components.touchSupport;
  // }
  
  // // 4. 语言（标准化处理，避免 Safari 重复问题）
  // if (result.components.languages?.value && result.components.languages.value.length > 0) {
  //   // 保持组件格式，但只取第一个语言值
  //   stableComponents.languages = {
  //     value: [result.components.languages.value[0]],
  //     duration: result.components.languages.duration
  //   };
  // }
  
  // console.log('Stable components for cross-browser fingerprint:', stableComponents);
  
  // // 如果没有任何稳定组件，使用随机 ID
  // if (Object.keys(stableComponents).length === 0) {
  //   console.warn('No stable components found, using random ID');
  //   return `random_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  // }
  
  // 使用稳定组件生成哈希
  return FingerprintJS.hashComponents(stableComponents);
}

/**
 * Initialize and get fingerprint agent
 */
export async function getFingerprintAgent() {
  if (!fpPromise) {
    fpPromise = FingerprintJS.load();
  }
  return fpPromise;
}

/**
 * Generate device fingerprint
 * Returns a unique hash based on browser/device characteristics
 * 
 * @deprecated 使用 generateVisitorId() 获取更稳定的跨浏览器访客 ID
 */
export async function generateFingerprint(): Promise<string> {
  try {
    const fp = await getFingerprintAgent();
    const result = await fp.get();
    return result.visitorId;
  } catch (error) {
    console.error('Failed to generate fingerprint:', error);
    // Fallback to a random ID if fingerprinting fails
    return `fallback_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }
}

/**
 * 生成稳定的访客 ID（跨浏览器）
 * 
 * 优先级策略：
 * 1. localStorage 中的设备 ID（浏览器隔离，但持久）
 * 2. 稳定的硬件指纹（跨浏览器一致）
 * 3. 服务端同步（通过 API 获取统一 ID）
 * 
 * 注意：Cookie 无法跨浏览器共享，因此优先使用硬件指纹
 * 
 * @returns 稳定的访客 ID
 */
export async function generateVisitorId(): Promise<string> {
  try {
    // 1. 从 localStorage 读取（当前浏览器的缓存）
    const storageId = getDeviceIdFromStorage();
    if (storageId) {
      console.log('Using device ID from storage:', storageId);
      return storageId;
    }

    // 2. 生成基于硬件的稳定指纹（跨浏览器一致）
    const stableFingerprint = await generateStableFingerprint();
    console.log('Generated new stable fingerprint:', stableFingerprint);
    
    // 保存到 localStorage（仅当前浏览器）
    setDeviceIdToStorage(stableFingerprint);
    
    return stableFingerprint;
  } catch (error) {
    console.error('Failed to generate visitor ID:', error);
    
    // 降级方案：生成随机 ID 并持久化
    const fallbackId = `fallback_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    setDeviceIdToStorage(fallbackId);
    
    return fallbackId;
  }
}

/**
 * 获取完整的访客信息（用于服务端验证）
 * 
 * @returns 包含访客 ID 和设备元数据的对象
 */
export async function getVisitorInfo() {
  const visitorId = await generateVisitorId();
  const metadata = getBrowserMetadata();
  
  return {
    visitorId,
    metadata,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Get browser metadata for storage
 */
export function getBrowserMetadata() {
  if (typeof window === 'undefined') {
    return null;
  }

  return {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    screenResolution: `${window.screen.width}x${window.screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timestamp: new Date().toISOString(),
  };
}
