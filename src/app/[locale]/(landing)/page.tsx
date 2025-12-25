import { getTranslations, setRequestLocale } from 'next-intl/server';

import { getThemePage } from '@/core/theme';
import { Landing } from '@/shared/types/blocks/landing';

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

  return <Page locale={locale} page={page} />;
}
