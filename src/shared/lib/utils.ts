import {type ClassValue, clsx} from 'clsx';
// import {useParams} from 'next/navigation';
import {twMerge} from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}



//  "sourceLanguage": "auto",
//  "targetLanguage": "zh",
export const LanguageMap: any = {
  'zh-CN': '中文',
  'zh': '中文',
  'en-US': '英文',
  'auto': '',

  '中文': 'zh-CN',
  '中文简体': 'zh-CN',
  '英文': 'en-US',
};
export const LanguageMapEn: any = {
  'zh-CN': 'chinese',
  'zh': 'chinese',
  'en-US': 'english',
  'auto': '',

  'chinese': 'zh-CN',
  'english': 'en-US',
};

// const statusMap: any = {
//   'pending': {label: '排队中', color: 'text-cyan-600'},
//   'processing': {label: '转换中', color: 'text-orange-500'},
//   'completed': {label: '转换成功', color: 'text-green-600'},
//   'failed': {label: '转换失败', color: 'text-red-500'},
//   'cancelled': {label: '已取消', color: 'text-gray-500'},
// };

/**
 * 语种转换
 * @param item {"sourceLanguage": "auto", "targetLanguage": "zh"}
 * @param locale
 * @returns
 */
export function getLanguageConvertStr(item: any, locale = 'zh') {
  // console.log('getLanguageConvertStr-->', item)
  if (locale === 'zh') {
    return `${LanguageMap[item?.sourceLanguage] || ''}转${
        LanguageMap[item?.targetLanguage] || '未知语种'}`;
  }
  const temp = LanguageMapEn[item?.sourceLanguage];
  return `${temp ? temp + ' ' : ''}to ${
      LanguageMapEn[item?.targetLanguage] || 'unknown language'}`;
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
  const duration = `${h.toString().padStart(2, '0')}:${
      m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
};


export function getPreviewUrl(userId: string, taskId: string, r2PreUrl: string, url: string) {
  taskId = taskId || 'task7';
  return `${r2PreUrl}/dev/${userId}/${taskId}/${url}`;
}

