import Image from 'next/image';
import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';

import { SmartIcon } from '@/shared/blocks/common/smart-icon';
import { Button } from '@/shared/components/ui/button';
import { AnimatedGridPattern } from '@/shared/components/ui/animated-grid-pattern';

export async function generateMetadata() {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'common.not_found' });

  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false },
  };
}

export default async function NotFoundPage() {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'common.not_found' });

  return (
    <div className="relative flex h-screen flex-col items-center justify-center overflow-hidden bg-black text-white selection:bg-white/20">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-[-20%] left-[-10%] h-[500px] w-[500px] rounded-full bg-purple-500/10 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] h-[500px] w-[500px] rounded-full bg-blue-500/10 blur-[120px]" />
      </div>

      <AnimatedGridPattern
        numSquares={50}
        maxOpacity={0.05}
        duration={5}
        repeatDelay={1}
        className="[mask-image:radial-gradient(900px_circle_at_center,white,transparent)] inset-0 h-full opacity-30 skew-y-0"
      />

      <div className="z-10 flex flex-col items-center gap-8 px-4 text-center">
        <div className="mb-8 hover:scale-105 transition-transform duration-500">
          <Image
            src="/logo.png"
            alt="SoulDub"
            width={128}
            height={128}
            className="h-24 w-auto sm:h-32 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"
            priority
          />
        </div>

        <div className="relative">
          <div className="absolute inset-0 animate-pulse rounded-full bg-gradient-to-r from-purple-500/20 to-blue-500/20 blur-xl" />
          <h1 className="relative bg-gradient-to-b from-white to-white/60 bg-clip-text text-9xl font-extrabold tracking-tighter text-transparent sm:text-[12rem]">
            404
          </h1>
        </div>

        <div className="space-y-4 max-w-lg mx-auto">
          <h2 className="text-2xl font-semibold text-white/90 sm:text-3xl">
            {t('heading')}
          </h2>
          <p className="text-lg text-white/60 leading-relaxed">
            {t('description')}
          </p>
        </div>

        <div className="mt-4">
          <Button
            asChild
            size="lg"
            className="rounded-full bg-white text-black hover:bg-gray-200 px-8 h-12 text-base transition-all hover:scale-105 shadow-[0_0_20px_-5px_rgba(255,255,255,0.3)]"
          >
            <Link href="/" className="flex items-center gap-2">
              <SmartIcon name="ArrowLeft" className="h-4 w-4" />
              <span>{t('back_home')}</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
