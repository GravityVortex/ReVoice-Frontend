import { getTranslations, setRequestLocale } from 'next-intl/server';

import { envConfigs } from '@/config';
import { locales, defaultLocale } from '@/config/locale';

export function getMetadata(
  options: {
    title?: string;
    description?: string;
    keywords?: string;
    metadataKey?: string;
    canonicalUrl?: string; // relative path (e.g. '/pricing') or full url
    imageUrl?: string;
    appName?: string;
    noIndex?: boolean;
  } = {}
) {
  return async function generateMetadata({
    params,
  }: {
    params: Promise<{ locale: string }>;
  }) {
    const { locale } = await params;
    setRequestLocale(locale);

    const passedMetadata = {
      title: options.title,
      description: options.description,
      keywords: options.keywords,
    };

    const defaultMeta = await getTranslatedMetadata(
      defaultMetadataKey,
      locale
    );

    let translatedMetadata: any = {};
    if (options.metadataKey) {
      translatedMetadata = await getTranslatedMetadata(
        options.metadataKey,
        locale
      );
    }

    const title =
      passedMetadata.title || translatedMetadata.title || defaultMeta.title;
    const description =
      passedMetadata.description ||
      translatedMetadata.description ||
      defaultMeta.description;
    const keywords =
      passedMetadata.keywords ||
      translatedMetadata.keywords ||
      defaultMeta.keywords;

    const canonicalUrl = options.canonicalUrl
      ? buildFullUrl(options.canonicalUrl, locale)
      : undefined;

    const alternateLanguages = options.canonicalUrl
      ? buildAlternateLanguages(options.canonicalUrl)
      : undefined;

    let imageUrl = options.imageUrl || '/og-image.png';
    if (!imageUrl.startsWith('http')) {
      imageUrl = `${getAppUrlBase()}${imageUrl}`;
    }

    const appName = options.appName || envConfigs.app_name || '';

    const twitterHandle = process.env.NEXT_PUBLIC_TWITTER_HANDLE || undefined;

    return {
      title,
      description,
      keywords,

      alternates: {
        ...(canonicalUrl ? { canonical: canonicalUrl } : {}),
        ...(alternateLanguages ? { languages: alternateLanguages } : {}),
      },

      openGraph: {
        type: 'website',
        locale,
        url: canonicalUrl,
        title,
        description,
        siteName: appName,
        images: [imageUrl],
      },

      twitter: {
        card: 'summary_large_image' as const,
        title,
        description,
        images: [imageUrl],
        ...(twitterHandle ? { site: twitterHandle } : {}),
      },

      robots: {
        index: !options.noIndex,
        follow: !options.noIndex,
      },
    };
  };
}

const defaultMetadataKey = 'common.metadata';

async function getTranslatedMetadata(metadataKey: string, locale: string) {
  setRequestLocale(locale);
  const t = await getTranslations(metadataKey);

  return {
    title: t.has('title') ? t('title') : '',
    description: t.has('description') ? t('description') : '',
    keywords: t.has('keywords') ? t('keywords') : '',
  };
}

function getAppUrlBase(): string {
  return (envConfigs.app_url || '').replace(/\/+$/, '');
}

/**
 * Build a full canonical URL from a relative path and locale.
 * Always includes /{locale} prefix (localePrefix = 'always').
 * Always strips trailing slash (trailingSlash = false).
 */
export function buildFullUrl(relativePath: string, locale: string): string {
  if (relativePath.startsWith('http')) {
    return relativePath.replace(/\/+$/, '');
  }

  if (!relativePath.startsWith('/')) {
    relativePath = `/${relativePath}`;
  }

  const base = getAppUrlBase();
  let url = `${base}/${locale}${relativePath}`;

  // Strip trailing slash (but keep root as /{locale})
  if (url.endsWith('/') && !url.endsWith(`/${locale}/`)) {
    url = url.replace(/\/+$/, '');
  }
  // For root path like /en/, keep it as /en
  if (url.endsWith(`/${locale}/`)) {
    url = url.slice(0, -1);
  }

  return url;
}

/**
 * Build alternates.languages object for hreflang tags.
 * Generates entries for all locales + x-default (points to defaultLocale).
 */
function buildAlternateLanguages(
  relativePath: string
): Record<string, string> {
  const languages: Record<string, string> = {};

  for (const loc of locales) {
    languages[loc] = buildFullUrl(relativePath, loc);
  }

  languages['x-default'] = buildFullUrl(relativePath, defaultLocale);

  return languages;
}
