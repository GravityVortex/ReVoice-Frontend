import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { envConfigs } from '@/config';
import { getThemePage } from '@/core/theme';
import { buildFullUrl } from '@/shared/lib/seo';
import { locales, defaultLocale } from '@/config/locale';
import { getLocalPage } from '@/shared/models/post';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const t = await getTranslations('common.metadata');
  const { locale, slug } = await params;

  const canonicalUrl = buildFullUrl(`/${slug}`, locale);
  const page = await getLocalPage({ slug, locale });

  const title = page
    ? `${page.title} | ${t('title')}`
    : `${slug} | ${t('title')}`;
  const description = page?.description || t('description');

  const languages: Record<string, string> = {};
  for (const loc of locales) {
    languages[loc] = buildFullUrl(`/${slug}`, loc);
  }
  languages['x-default'] = buildFullUrl(`/${slug}`, defaultLocale);

  const appUrl = (envConfigs.app_url || '').replace(/\/+$/, '');
  const appName = envConfigs.app_name || 'SoulDub';

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
      languages,
    },
    openGraph: {
      type: 'website' as const,
      title,
      description,
      url: canonicalUrl,
      siteName: appName,
      images: [`${appUrl}/og-image.png`],
    },
    twitter: {
      card: 'summary_large_image' as const,
      title,
      description,
      images: [`${appUrl}/og-image.png`],
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function DynamicPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const page = await getLocalPage({ slug, locale });
  if (!page) {
    return notFound();
  }

  const Page = await getThemePage('page-detail');

  return <Page locale={locale} post={page} />;
}
