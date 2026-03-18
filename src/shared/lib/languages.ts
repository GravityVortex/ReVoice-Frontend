export const SUPPORTED_LANGUAGES = [
  { code: 'en', labelZh: '英语', labelEn: 'English' },
  { code: 'zh', labelZh: '简体中文', labelEn: 'Chinese' },
  { code: 'es', labelZh: '西班牙语', labelEn: 'Spanish' },
  { code: 'pt', labelZh: '葡萄牙语', labelEn: 'Portuguese' },
  { code: 'fr', labelZh: '法语', labelEn: 'French' },
  { code: 'de', labelZh: '德语', labelEn: 'German' },
  { code: 'it', labelZh: '意大利语', labelEn: 'Italian' },
  { code: 'ja', labelZh: '日语', labelEn: 'Japanese' },
] as const;

export type LangCode = (typeof SUPPORTED_LANGUAGES)[number]['code'];

const langByCode = new Map<string, (typeof SUPPORTED_LANGUAGES)[number]>(
  SUPPORTED_LANGUAGES.map((l) => [l.code, l])
);

export function getLangLabel(code: string, locale = 'zh'): string {
  const lang = langByCode.get(code);
  if (!lang) return code;
  return locale === 'zh' ? lang.labelZh : lang.labelEn;
}

export function getLangOptions(locale = 'zh') {
  return SUPPORTED_LANGUAGES.map((l) => ({
    value: l.code,
    label: locale === 'zh' ? l.labelZh : l.labelEn,
  }));
}

export function isValidLangCode(code: string): code is LangCode {
  return langByCode.has(code);
}

export function getDefaultTargetLang(source: string): LangCode {
  if (source === 'en') return 'zh';
  return 'en';
}
