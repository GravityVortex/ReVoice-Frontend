import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PERMISSIONS } from '@/core/rbac';
import { Link } from '@/core/i18n/navigation';
import { getThemePage } from '@/core/theme';
import { getMetadata } from '@/shared/lib/seo';
import { checkSoulDubAccess } from '@/shared/lib/souldub';
import { Button } from '@/shared/components/ui/button';
import { getAllConfigs } from '@/shared/models/config';
import { getCurrentSubscription } from '@/shared/models/subscription';
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
          <div className="absolute top-[-20%] left-[-10%] h-[500px] w-[500px] rounded-full bg-purple-500/10 blur-[120px]" />
          <div className="absolute bottom-[-20%] right-[-10%] h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-[120px]" />
        </div>

        {/* Content Container */}
        <div className="z-10 flex max-w-2xl flex-col items-center gap-8 px-4 text-center">
          {/* Icon/Badge */}
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 animate-pulse rounded-full bg-gradient-to-r from-purple-500/20 to-blue-500/20 blur-xl" />
            <div className="relative rounded-full border border-white/10 bg-white/5 p-6 backdrop-blur-xl transition-transform hover:scale-105">
              <span className="text-5xl">✨</span>
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
  const currentSubscriptionPromise = (async () => {
    try {
      const user = await userPromise;
      if (!user) return undefined;
      return await getCurrentSubscription(user.id);
    } catch (error) {
      console.log('getting current subscription failed:', error);
      return undefined;
    }
  })();

  const [t, Page, currentSubscription] = await Promise.all([
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
