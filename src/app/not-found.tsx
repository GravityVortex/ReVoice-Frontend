import Link from 'next/link';

import { SmartIcon } from '@/shared/blocks/common/smart-icon';
import { Button } from '@/shared/components/ui/button';
import { AnimatedGridPattern } from '@/shared/components/ui/animated-grid-pattern';

export default function NotFoundPage() {
  return (
    <div className="relative flex h-screen flex-col items-center justify-center overflow-hidden bg-black text-white selection:bg-white/20">
      {/* Background Gradients */}
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
        {/* Brand Logo - Enhanced */}
        <div className="mb-8 hover:scale-105 transition-transform duration-500">
          <img src="/logo.png" alt="SoulDub" className="h-24 w-auto sm:h-32 drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]" />
        </div>

        {/* 404 Glitch Effect or Large Text */}
        <div className="relative">
          <div className="absolute inset-0 animate-pulse rounded-full bg-gradient-to-r from-purple-500/20 to-blue-500/20 blur-xl" />
          <h1 className="relative bg-gradient-to-b from-white to-white/60 bg-clip-text text-9xl font-extrabold tracking-tighter text-transparent sm:text-[12rem]">
            404
          </h1>
        </div>

        <div className="space-y-4 max-w-lg mx-auto">
          <h2 className="text-2xl font-semibold text-white/90 sm:text-3xl">
            Page Not Found
          </h2>
          <p className="text-lg text-white/60 leading-relaxed">
            The page you are looking for might have been removed, had its name changed, or is temporarily unavailable.
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
              <span>Return Home</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
