import { getTranslations, setRequestLocale } from 'next-intl/server';

import { getThemePage } from '@/core/theme';
import { getMetadata } from '@/shared/lib/seo';
import { getCurrentSubscription } from '@/shared/models/subscription';
import { getUserInfo } from '@/shared/models/user';
import {
  FAQ as FAQType,
  Testimonials as TestimonialsType,
} from '@/shared/types/blocks/landing';
import { Pricing as PricingType } from '@/shared/types/blocks/pricing';

export const generateMetadata = getMetadata({
  metadataKey: 'pricing.metadata',
  canonicalUrl: '/pricing',
});

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const landingTranslationsPromise = getTranslations('landing');
  const pricingTranslationsPromise = getTranslations('pricing');
  const pagePromise = getThemePage('pricing');

  const currentSubscriptionPromise = (async () => {
    try {
      const user = await getUserInfo();
      if (!user) return undefined;
      return await getCurrentSubscription(user.id);
    } catch (error) {
      console.log('getting current subscription failed:', error);
      return undefined;
    }
  })();

  const [tl, t, Page, currentSubscription] = await Promise.all([
    landingTranslationsPromise,
    pricingTranslationsPromise,
    pagePromise,
    currentSubscriptionPromise,
  ]);

  // build sections
  const pricing: PricingType = t.raw('pricing');
  const faq: FAQType = tl.raw('faq');
  const testimonials: TestimonialsType = tl.raw('testimonials');

  return (
    <Page
      locale={locale}
      pricing={pricing}
      currentSubscription={currentSubscription}
      faq={faq}
      testimonials={testimonials}
    />
  );
}
