import { getTranslations } from 'next-intl/server';

import { envConfigs } from '@/config';
import { defaultLocale } from '@/config/locale';
import { SignInForm } from '@/shared/blocks/sign/sign-in-form';
import { sanitizeCallbackUrl } from '@/shared/lib/safe-redirect';

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
      canonical:
        locale !== defaultLocale
          ? `${envConfigs.app_url}/${locale}/sign-in`
          : `${envConfigs.app_url}/sign-in`,
    },
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
    Vozo-inspired Split Layout:
    - Left: Cinematic Visual (Brand, Value Prop, Social Proof)
    - Right: Functional Login Form (Clean, Minimal)
  */
  return (
    <div className="w-full relative h-screen flex-col items-center justify-center grid lg:max-w-none lg:grid-cols-2 lg:px-0">
      {/* Left Side - Global Network Visual */}
      <div className="relative hidden h-full flex-col bg-black p-12 text-white lg:flex overflow-hidden justify-between">
        {/* Soft Blend Gradient to Right Panel - Reduces "Heavy Boundary" */}
        <div className="absolute right-0 top-0 bottom-0 w-64 bg-gradient-to-l from-background/60 to-transparent z-20 pointer-events-none" />

        {/* Deep Space Background */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,#1e1b4b,black_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,#172554,transparent_60%)]" />

        {/* Animated Network Globe */}
        <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
          <div className="relative w-[800px] h-[800px] opacity-80">
            {/* Rotating Rings */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full border border-blue-500/20 border-dashed animate-[spin_60s_linear_infinite]" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full border border-purple-500/20 animate-[spin_40s_linear_infinite_reverse]" />

            {/* Connecting Lines SVG */}
            <svg className="absolute inset-0 w-full h-full" viewBox="0 0 800 800">
              <defs>
                <linearGradient id="conn-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgba(59,130,246,0)" />
                  <stop offset="50%" stopColor="rgba(59,130,246,0.8)" />
                  <stop offset="100%" stopColor="rgba(139,92,246,0)" />
                </linearGradient>
              </defs>

              {/* Dynamic Curves simulating global connections */}
              <path d="M200,400 Q400,200 600,400" fill="none" stroke="url(#conn-grad)" strokeWidth="2" className="animate-[pulse_4s_infinite]" />
              <path d="M250,500 Q400,650 550,500" fill="none" stroke="url(#conn-grad)" strokeWidth="1.5" className="animate-[pulse_5s_infinite]" style={{ animationDelay: '1s' }} />
              <path d="M300,300 Q500,400 300,500" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="1" strokeDasharray="4 4" />

              {/* Active Nodes */}
              <circle cx="200" cy="400" r="4" fill="#60a5fa">
                <animate attributeName="r" values="4;8;4" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite" />
              </circle>
              <circle cx="600" cy="400" r="4" fill="#a78bfa">
                <animate attributeName="r" values="4;8;4" dur="3s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="1;0.5;1" dur="3s" repeatCount="indefinite" />
              </circle>
            </svg>

            {/* Central Glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-indigo-500/20 rounded-full blur-[60px] animate-pulse" />
          </div>
        </div>

        {/* Brand Logo - Top Left - Enlarged */}
        <div className="relative z-20 flex items-center">
          <img src="/logo.png" alt="Logo" className="h-14 w-auto object-contain drop-shadow-[0_0_20px_rgba(59,130,246,0.5)]" />
        </div>

        {/* Product Slogan - Bottom */}
        <div className="relative z-20">
          <h2 className="text-3xl font-bold tracking-tight mb-4 text-white drop-shadow-lg">
            {t('marketing_slogan_title', { defaultValue: 'One World, Many Voices.' })}
          </h2>
          <p className="text-lg text-zinc-300 max-w-lg drop-shadow-md">
            {t('marketing_slogan_desc', { defaultValue: 'Connect across languages with authentic AI video translation.' })}
          </p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="lg:p-8 relative flex h-full items-center justify-center p-4">
        {/* Back Button (Mobile/Desktop) */}
        <div className="absolute left-4 top-4 lg:hidden">
          {/* Mobile logo or back */}
        </div>

        <div className="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[380px]">
          <div className="flex flex-col space-y-2 text-center">
            <div className="flex justify-center mb-4 lg:hidden">
              <img src="/logo.png" alt="Logo" className="h-10 w-10" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t('sign_in_title')}
            </h1>
            <p className="text-sm text-muted-foreground">
              {t('sign_in_description')}
            </p>
          </div>

          {/* Login Form Container */}
          <SignInForm callbackUrl={safeCallbackUrl} />

          <p className="px-8 text-center text-sm text-muted-foreground/80 leading-7 mt-4">
            {t.rich('legal_agreement', {
              terms: (chunks) => (
                <a href="/terms" className="underline underline-offset-4 hover:text-primary">
                  {chunks}
                </a>
              ),
              privacy: (chunks) => (
                <a href="/privacy" className="underline underline-offset-4 hover:text-primary">
                  {chunks}
                </a>
              ),
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
