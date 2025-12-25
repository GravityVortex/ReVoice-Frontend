import { clsx, type ClassValue } from 'clsx';
// import {useParams} from 'next/navigation';
import { twMerge } from 'tailwind-merge';

const endpoint = process.env.R2_ENDPOINT!;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

//  "sourceLanguage": "auto",
//  "targetLanguage": "zh",
export const LanguageMap: any = {
  'zh-CN': '中文',
  zh: '中文',
  'en-US': '英文',
  en: '英文',
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
  auto: '',

  chinese: 'zh',
  english: 'en',
};

// const statusMap: any = {
//   'pending': {label: '排队中', color: 'text-cyan-600'},
//   'processing': {label: '转换中', color: 'text-orange-500'},
//   'completed': {label: '转换成功', color: 'text-green-600'},
//   'failed': {label: '转换失败', color: 'text-red-500'},
//   'cancelled': {label: '已取消', color: 'text-gray-500'},
// };

export function getLanguageMapStr(key: string, locale = 'zh') {
  if (locale === 'zh') {
    return `${LanguageMap[key] || '未知'}`;
  }
  return `${LanguageMapEn[key] || '未知'}`;
}
/**
 * 语种转换
 * @param item {"sourceLanguage": "auto", "targetLanguage": "zh"}
 * @param locale
 * @returns
 */
export function getLanguageConvertStr(item: any, locale = 'zh') {
  // console.log('getLanguageConvertStr-->', locale, item)
  if (locale === 'zh') {
    return `${LanguageMap[item?.sourceLanguage] || ''}转${LanguageMap[item?.targetLanguage] || '未知语种'}`;
  }
  const temp = LanguageMapEn[item?.sourceLanguage];
  return `${temp ? temp + ' ' : ''}to ${LanguageMapEn[item?.targetLanguage] || 'unknown language'}`;
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
