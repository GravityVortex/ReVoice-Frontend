import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { getLangLabel } from '@/shared/lib/languages';

const endpoint = process.env.R2_ENDPOINT!;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const LanguageMap: any = {
  'zh-CN': '中文',
  zh: '简体中文',
  'en-US': '英语',
  en: '英语',
  es: '西班牙语',
  pt: '葡萄牙语',
  fr: '法语',
  de: '德语',
  it: '意大利语',
  ja: '日语',
  auto: '',

  中文: 'zh',
  中文简体: 'zh',
  英文: 'en',
};
export const LanguageMapEn: any = {
  'zh-CN': 'chinese',
  zh: 'chinese',
  'en-US': 'english',
  en: 'english',
  es: 'spanish',
  pt: 'portuguese',
  fr: 'french',
  de: 'german',
  it: 'italian',
  ja: 'japanese',
  auto: '',

  chinese: 'zh',
  english: 'en',
};

export function getLanguageMapStr(key: string, locale = 'zh') {
  return getLangLabel(key, locale) || (locale === 'zh' ? '未知' : 'Unknown');
}

export function getLanguageConvertStr(item: any, locale = 'zh') {
  const src = getLangLabel(item?.sourceLanguage, locale);
  const tgt = getLangLabel(item?.targetLanguage, locale);
  if (locale === 'zh') {
    return `${src || ''} → ${tgt || '未知语种'}`;
  }
  return `${src || ''} → ${tgt || 'unknown language'}`;
}

/**
 * 秒转时分秒
 * @param seconds 8000
 * @returns
 */
export function miao2Hms(seconds = 0) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const duration = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return duration;
}

/**
 * 格式化时间
 * @param dateStr 日期字符串
 * @returns 格式化后的时间字符串
 */
export function formatDate(dateStr: string) {
  if (!dateStr) return '-';
  try {
    return new Date(dateStr).toLocaleString('zh-CN');
  } catch {
    return dateStr;
  }
}

export function timeAgo(dateStr: string, locale = 'zh'): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    if (diffMs < 0) return '-';
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    const isZh = locale === 'zh';

    if (diffSec < 60) return isZh ? '刚刚' : 'Just now';
    if (diffMin < 60) return isZh ? `${diffMin} 分钟前` : `${diffMin}m ago`;
    if (diffHour < 24) return isZh ? `${diffHour} 小时前` : `${diffHour}h ago`;
    if (diffDay === 1) return isZh ? '昨天' : 'Yesterday';
    if (diffDay < 7) return isZh ? `${diffDay} 天前` : `${diffDay}d ago`;

    const month = date.getMonth() + 1;
    const day = date.getDate();
    const year = date.getFullYear();

    return isZh ? `${year}年${month}月${day}日` : `${month}/${day}/${year}`;
  } catch {
    return dateStr;
  }
}

export function formatFullDate(dateStr: string, locale = 'zh'): string {
  if (!dateStr) return '-';
  try {
    const date = new Date(dateStr);
    const loc = locale === 'zh' ? 'zh-CN' : 'en-US';
    return date.toLocaleString(loc, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

/**
 * 获取完整的视频封面图片
 * @param userId
 * @param fileId
 * @param r2PreUrl
 * @param url
 * @returns
 */
export function getPreviewUrl(userId: string, fileId: string, r2PreUrl: string, url: string) {
  // 生产环境和测试环境
  // 封面地址：{env}/{userId}/{fileId}/frame_img/image/xxx.jpg
  // let env = process.env.NODE_ENV === 'production' ? 'pro' : 'dev'; // dev、pro
  let env = process.env.ENV || 'dev';
  return `${r2PreUrl}/${env}/${userId}/${fileId}/${url}`;
}

/**
 * 公桶中获取完整的视频封面图片
 * @param videoItem
 * @param r2PreUrl
 * @returns
 */
export function getPreviewCoverUrl(videoItem: any, r2PreUrl: string) {
  if (!videoItem || !videoItem?.coverR2Key) return '';

  // let env = process.env.NODE_ENV === 'production' ? 'pro' : 'dev'; // dev、pro
  let env = process.env.ENV || 'dev';
  // 封面地址：{env}/{userId}/{fileId}/frame_img/image/xxx.jpg
  return `${videoItem.r2PreUrl || r2PreUrl}/${env}/${videoItem.userId}/${videoItem.id}/${videoItem.coverR2Key}`;
  // return `${videoItem.r2PreUrl || r2PreUrl}/${env}/${videoItem.userId}/frame_img/image/${videoItem.coverR2Key}.jpg`;
}

/**
 * 获取音频文件地址
 * @param userId
 * @param taskId
 * @param r2Key
 * @returns
 */
export function getAudioR2PathName(userId: string, taskId: string, r2Key: string) {
  let env = process.env.ENV || 'dev';
  return `${userId}/${taskId}/${r2Key}`;
}

export function getVideoR2PathName(userId: string, taskId: string, r2Key: string) {
  // 生产环境和测试环境
  // 原视频地址：{env}/{userId}/{taskId}/original/video/video_original.mp4
  // 预览视频地址：{env}/{userId}/{taskId}/preview/video/video_new_preview.mp4
  // 最终视频地址：{env}/{userId}/{taskId}/merge_audio_video/video/video_new.mp4
  // let env = process.env.NODE_ENV === 'production' ? 'pro' : 'dev'; // dev、pro
  let env = process.env.ENV || 'dev';
  return `${userId}/${taskId}/${r2Key}`;
}
