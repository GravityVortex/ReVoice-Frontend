import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AudioWaveform } from 'lucide-react';

import { PERMISSIONS } from '@/core/rbac';
import { Link } from '@/core/i18n/navigation';
import { getThemePage } from '@/core/theme';
import { getMetadata } from '@/shared/lib/seo';
import { checkSoulDubAccess } from '@/shared/lib/souldub';
import { Button } from '@/shared/components/ui/button';
import { getAllConfigs } from '@/shared/models/config';
import { getActiveSubscriptions } from '@/shared/models/subscription';
import { getUserInfo } from '@/shared/models/user';
import { hasPermission } from '@/shared/services/rbac';
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

  const userPromise = getUserInfo();
  const configsPromise = getAllConfigs();
  const isAdminPromise = (async () => {
    const user = await userPromise;
    if (!user) return false;
    try {
      return await hasPermission(user.id, PERMISSIONS.ADMIN_ACCESS);
    } catch {
      return false;
    }
  })();
  const souldubAccessPromise = (async () => {
    const [user, configs, isAdmin] = await Promise.all([
      userPromise,
      configsPromise,
      isAdminPromise,
    ]);
    return checkSoulDubAccess(user?.email, configs, isAdmin);
  })();

  const landingTranslationsPromise = getTranslations('landing');
  const [tl, souldubAccess] = await Promise.all([
    landingTranslationsPromise,
    souldubAccessPromise,
  ]);

  if (!souldubAccess) {
    return (
      <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-black text-white selection:bg-white/20">
        {/* Background Gradients */}
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute top-[-20%] left-[-10%] h-[520px] w-[520px] rounded-full bg-amber-500/10 blur-[120px]" />
          <div className="absolute bottom-[-20%] right-[-10%] h-[520px] w-[520px] rounded-full bg-emerald-500/10 blur-[120px]" />
        </div>

        {/* Content Container */}
        <div className="z-10 flex max-w-2xl flex-col items-center gap-8 px-4 text-center">
          {/* Icon/Badge */}
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 animate-pulse rounded-full bg-gradient-to-r from-amber-400/20 to-emerald-400/20 blur-xl" />
            <div className="relative rounded-full border border-white/10 bg-white/5 p-6 backdrop-blur-xl transition-transform hover:scale-105">
              <AudioWaveform className="h-10 w-10 text-amber-200" />
            </div>
          </div>

          <div className="space-y-4">
            <h1 className="bg-gradient-to-b from-white to-white/60 bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-7xl">
              {tl('souldub_gate.title')}
            </h1>
            <p
              className="mx-auto max-w-lg text-lg text-white/60 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: tl.raw('souldub_gate.description') }}
            />
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            <Button asChild size="lg" className="rounded-full bg-white text-black hover:bg-gray-200 px-8 transition-all hover:scale-105">
              <Link href="/">{tl('souldub_gate.return_home')}</Link>
            </Button>
          </div>
        </div>

        {/* Grid Pattern Overlay */}
        <div className="pointer-events-none absolute inset-0 bg-[url('/grid.svg')] bg-center opacity-[0.03] [mask-image:linear-gradient(180deg,white,rgba(255,255,255,0))]" />
      </div>
    );
  }

  const pricingTranslationsPromise = getTranslations('pricing');
  const pagePromise = getThemePage('pricing');
  const activeSubscriptionsPromise = (async () => {
    try {
      const user = await userPromise;
      if (!user) return [];
      return await getActiveSubscriptions(user.id);
    } catch (error) {
      console.log('getting active subscriptions failed:', error);
      return [];
    }
  })();

  const [t, Page, activeSubscriptions] = await Promise.all([
    pricingTranslationsPromise,
    pagePromise,
    activeSubscriptionsPromise,
  ]);

  // build sections
  const pricing: PricingType = t.raw('pricing');
  const faq: FAQType = tl.raw('faq');
  const testimonials: TestimonialsType = tl.raw('testimonials');

  return (
    <Page
      locale={locale}
      pricing={pricing}
      activeSubscriptions={activeSubscriptions}
      faq={faq}
      testimonials={testimonials}
    />
  );
}
