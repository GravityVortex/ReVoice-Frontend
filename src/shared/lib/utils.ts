import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

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

const statusMap: any = {
  'pending': { label: '排队中', color: 'text-cyan-600' },
  'processing': { label: '转换中', color: 'text-orange-500' },
  'completed': { label: '转换成功', color: 'text-green-600' },
  'failed': { label: '转换失败', color: 'text-red-500' },
  'cancelled': { label: '已取消', color: 'text-gray-500' },
};

//  "sourceLanguage": "auto",
//  "targetLanguage": "zh",
export function getLanguageConvertStr(item: any) {
  // console.log('getLanguageConvertStr-->', item)
  return `${LanguageMap[item?.sourceLanguage] 
    || ''}转${LanguageMap[item?.targetLanguage] || '未知语种'}`;
}


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
  if (!dateStr) return "-";
  try {
    return new Date(dateStr).toLocaleString("zh-CN");
  } catch {
    return dateStr;
  }
};

