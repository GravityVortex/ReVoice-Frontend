import { locales } from '@/config/locale';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const localeGroup = locales.map(escapeRegExp).join('|');
const LOCALE_PREFIX_RE =
  localeGroup.length > 0
    ? new RegExp(`^/(?:${localeGroup})(?=/|$|\\?|#)`)
    : null;

// next-intl's `useRouter()` expects hrefs WITHOUT a locale prefix (it adds it).
export function stripLocalePrefix(href: string): string {
  if (typeof href !== 'string' || href.length === 0) return '/';
  if (!href.startsWith('/')) return href;
  if (!LOCALE_PREFIX_RE) return href;

  const stripped = href.replace(LOCALE_PREFIX_RE, '');
  if (stripped.length === 0) return '/';
  return stripped.startsWith('/') ? stripped : `/${stripped}`;
}

