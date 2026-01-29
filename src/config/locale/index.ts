export const localeNames: Record<string, string> = {
  en: 'English',
  zh: '中文',
};

export const locales = ['en', 'zh'];

// Fallback locale when we can't infer a better match.
export const defaultLocale = 'en';

// Locale prefix strategy. 'as-needed' allows paths without locale prefix
// and prevents next-intl from redirecting static assets like /_next/...
export const localePrefix = 'as-needed' as const;

// Enable server-side locale detection (cookie + Accept-Language) via middleware.
export const localeDetection = true;

export const localeMessagesRootPath = '@/config/locale/messages';

export function getLocaleDisplayName(locale: string, displayLocale: string): string {
  // Keep locale names consistent with the current UI language when possible.
  // Fallback to our static map and then to the raw locale code.
  try {
    const DisplayNames = (Intl as any)?.DisplayNames;
    if (typeof DisplayNames === 'function') {
      const dn = new DisplayNames([displayLocale], { type: 'language' });
      const name = dn.of(locale);
      if (typeof name === 'string' && name.trim()) return name;
    }
  } catch {
    // Ignore and fallback.
  }

  return localeNames[locale] ?? locale;
}

export const localeMessagesPaths = [
  'common',
  'landing',
  'showcases',
  'blog',
  'pricing',
  'settings/sidebar',
  'settings/profile',
  'settings/guestVerification',
  'settings/security',
  'settings/billing',
  'settings/payments',
  'settings/credits',
  'settings/apikeys',
  'admin/sidebar',
  'admin/users',
  'admin/roles',
  'admin/permissions',
  'admin/categories',
  'admin/posts',
  'admin/payments',
  'admin/subscriptions',
  'admin/credits',
  'admin/settings',
  'admin/apikeys',
  'admin/ai-tasks',
  'admin/chats',
  'ai/music',
  'ai/chat',
  'ai/image',
  'activity/sidebar',
  'activity/ai-tasks',
  'activity/chats',
  'video_convert/sidebar',
  'video_convert/myVideoList',
  'video_convert/projectDetail',
  'video_convert/projectAddConvertModal',
  'video_convert/projectUpdateModal',
  'video_convert/videoEditor',

  'test/sidebar',
];
