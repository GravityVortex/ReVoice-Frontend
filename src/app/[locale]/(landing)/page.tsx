import { getTranslations, setRequestLocale } from 'next-intl/server';

import { envConfigs } from '@/config';
import { getThemePage } from '@/core/theme';
import { getMetadata } from '@/shared/lib/seo';
import { Landing } from '@/shared/types/blocks/landing';

export const generateMetadata = getMetadata({
  canonicalUrl: '/',
});

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // load page data
  const t = await getTranslations('landing');

  // build page params
  const page: Landing = {
    hero: t.raw('hero'),
    logos: t.raw('logos'),
    introduce: t.raw('introduce'),
    benefits: t.raw('benefits'),
    usage: t.raw('usage'),
    features: t.raw('features'),
    stats: t.raw('stats'),
    showcases: t.raw('showcases'),
    subscribe: t.raw('subscribe'),
    testimonials: t.raw('testimonials'),
    faq: t.raw('faq'),
    cta: t.raw('cta'),
  };
  // 应用案例：src/themes/default/blocks/features-accordion.tsx
  // 步骤板块：src/themes/default/blocks/features-step.tsx

  // 实际加载src/themes/default/pages/landing.tsx，内含若干行page（相当于div）
  const Page = await getThemePage('landing');

  const faqItems = (page.faq as any)?.items || [];
  const siteUrl = (envConfigs.app_url || 'https://www.souldub.ai').replace(/\/+$/, '');
  const appName = envConfigs.app_name || 'SoulDub';

  const faqJsonLd = faqItems.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item: { question: string; answer: string }) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  } : null;

  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: appName,
    url: siteUrl,
    logo: `${siteUrl}/og-image.png`,
  };

  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: appName,
    url: siteUrl,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
      />
      {faqJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      )}
      <Page locale={locale} page={page} />
    </>
  );
}
