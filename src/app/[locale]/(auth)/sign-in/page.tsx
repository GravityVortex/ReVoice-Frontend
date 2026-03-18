import { getTranslations } from 'next-intl/server';
import NextLink from 'next/link';

import { SignInForm } from '@/shared/blocks/sign/sign-in-form';
import { buildFullUrl } from '@/shared/lib/seo';
import { sanitizeCallbackUrl } from '@/shared/lib/safe-redirect';
import { OrganicWave } from '@/shared/components/ui/organic-wave';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('common');

  return {
    title: `${t('sign.sign_in_title')} - ${t('metadata.title')}`,
    alternates: {
      canonical: buildFullUrl('/sign-in', locale),
    },
    robots: { index: false, follow: false },
  };
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;
  const t = await getTranslations('common.sign');
  const safeCallbackUrl = sanitizeCallbackUrl(callbackUrl, '/');

  /*
    Unified Layout with Flowing Wave:
    - Wave animation spans the entire screen
    - Gradient fades from left to right
    - Seamless integration between both panels
  */
  return (
    <div className="w-full relative h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-2 lg:px-0 overflow-hidden">
      {/* Unified Background Layer - matches theme.css --background */}
      <div className="absolute inset-0 bg-background" />

      {/* Organic Wave - spans full screen */}
      <OrganicWave className="z-10" />

      {/* Left Side - Branding */}
      <div className="relative hidden h-full flex-col p-6 lg:p-10 text-white lg:flex overflow-hidden justify-between z-20">
        {/* Brand Logo - Top Left - Enlarged */}
        <div className="relative z-30">
          <img
            src="/logo.png"
            alt="Logo"
            className="h-20 lg:h-24 w-auto object-contain drop-shadow-[0_0_30px_rgba(167,139,250,0.3)]"
          />
        </div>

        {/* Product Slogan - Bottom */}
        <div className="relative z-30 max-w-md">
          <h2 className="text-3xl lg:text-4xl font-bold tracking-tight mb-5 text-white drop-shadow-lg leading-tight">
            {t('marketing_slogan_title', { defaultValue: 'One World, Many Voices.' })}
          </h2>
          <p className="text-base lg:text-lg text-zinc-400 drop-shadow-md leading-relaxed">
            {t('marketing_slogan_desc', { defaultValue: 'Connect across languages with authentic AI video translation.' })}
          </p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="lg:p-8 relative flex h-full items-center justify-center p-4 z-20">
        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[400px] relative z-30">
          {/* Mobile Logo */}
          <div className="flex flex-col space-y-3 text-center">
            <div className="flex justify-center mb-2 lg:hidden">
              <img src="/logo.png" alt="Logo" className="h-12 w-auto" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t('sign_in_title')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('sign_in_description')}
            </p>
          </div>

          {/* Login Form Container with subtle glass effect */}
          <div className="rounded-2xl p-6 bg-white/2 border border-white/5 backdrop-blur-sm">
            <SignInForm callbackUrl={safeCallbackUrl} />
          </div>

          <p className="px-8 text-center text-sm text-muted-foreground/80 leading-7">
            {t.rich('legal_agreement', {
              terms: (chunks) => (
                <NextLink
                  href="/terms"
                  className="underline underline-offset-4 hover:text-primary transition-colors"
                >
                  {chunks}
                </NextLink>
              ),
              privacy: (chunks) => (
                <NextLink
                  href="/privacy"
                  className="underline underline-offset-4 hover:text-primary transition-colors"
                >
                  {chunks}
                </NextLink>
              ),
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
