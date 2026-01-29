'use client';

import { Fragment } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { SmartIcon } from '@/shared/blocks/common';
import { AnimatedGridPattern } from '@/shared/components/ui/animated-grid-pattern';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';
import { Hero as HeroType } from '@/shared/types/blocks/landing';

const createFadeInVariant = (delay: number) => ({
  initial: { opacity: 0, y: 20, filter: 'blur(10px)' },
  animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
  transition: { duration: 0.8, delay, ease: [0.2, 0.8, 0.2, 1] as const },
});

export function Hero({
  hero,
  className,
}: {
  hero: HeroType;
  className?: string;
}) {
  const titleText = hero.title ?? '';
  const highlightText = hero.highlight_text ?? '';
  const titleLines = titleText.split(/\r?\n|\\n/).filter((line) => line.trim());

  const renderHighlightedText = () => (
    <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-400">
      {highlightText}
    </span>
  );

  const renderTitle = () => {
    let didHighlight = false;

    return titleLines.map((line, index) => {
      if (!highlightText || didHighlight || !line.includes(highlightText)) {
        return (
          <Fragment key={`hero-title-line-${index}`}>
            {index > 0 && <br />}
            {line}
          </Fragment>
        );
      }

      didHighlight = true;
      const highlightIndex = line.indexOf(highlightText);
      const pre = line.slice(0, highlightIndex);
      const post = line.slice(highlightIndex + highlightText.length);

      return (
        <Fragment key={`hero-title-line-${index}`}>
          {index > 0 && <br />}
          {pre}
          {renderHighlightedText()}
          {post}
        </Fragment>
      );
    });
  };

  return (
    <section
      id={hero.id}
      className={cn(
        'relative w-full overflow-hidden pt-32 pb-20 md:pt-40 md:pb-32 bg-black', // FORCE BLACK BG
        hero.className,
        className
      )}
    >
      {/* Background Ambience - Vozo Style Radial Glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120vw] h-[800px] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-primary/5 to-transparent blur-[80px] opacity-40 pointer-events-none" />

      <AnimatedGridPattern
        numSquares={50}
        maxOpacity={0.05}
        duration={5}
        repeatDelay={1}
        className={cn(
          '[mask-image:radial-gradient(900px_circle_at_center,white,transparent)]',
          'inset-0 h-full opacity-30 skew-y-0'
        )}
      />

      <div className="container relative z-10 mx-auto px-4 md:px-6 flex flex-col items-center text-center">

        {/* Main Visual - Big.png (Top Placement) */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="mb-12 relative z-20"
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-primary/20 blur-[80px] rounded-full pointer-events-none" />
          <img
            src="/big.png"
            alt="SoulDub"
            className="relative w-auto h-32 md:h-40 lg:h-48 object-contain drop-shadow-[0_0_30px_rgba(255,255,255,0.15)]"
            onError={(e) => { e.currentTarget.src = "/logo.png" }}
          />
        </motion.div>

        {/* Announcement/Badge */}
        {hero.announcement && (
          <motion.div {...createFadeInVariant(0.1)}>
            <Link
              href={hero.announcement.url || ''}
              target={hero.announcement.target || '_self'}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/10 text-xs font-medium text-primary hover:bg-primary/20 transition-colors mb-8"
            >
              <span>{hero.announcement.title}</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </motion.div>
        )}

        {/* Title */}
        <motion.div {...createFadeInVariant(0.25)} className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl md:text-7xl lg:text-7xl leading-[1.1] text-white">
            <span className="text-transparent bg-clip-text bg-gradient-to-b from-white to-[rgba(255,255,255,0.7)]">
              {renderTitle()}
            </span>
          </h1>
        </motion.div>

        {/* Brand Statement / Subtitle */}
        <motion.p
          {...createFadeInVariant(0.35)}
          className="mt-6 text-lg md:text-xl text-[rgba(255,255,255,0.6)] max-w-2xl mx-auto leading-relaxed"
          dangerouslySetInnerHTML={{ __html: hero.brand_statement || hero.description || '' }}
        />

        {/* Buttons */}
        {hero.buttons && (
          <motion.div
            {...createFadeInVariant(0.5)}
              className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 w-full"
            >
            {hero.buttons.map((button, idx) => {
              return (
                <Button
                  asChild
                  size="lg"
                  variant={idx === 0 ? 'default' : 'outline'}
                  className={cn(
                    "min-w-[160px] h-12 text-base px-8 rounded-full transition-all duration-300",
                    idx === 0 && "bg-[#6366F1] hover:bg-[#5558DD] text-white shadow-[0_0_20px_-5px_rgba(99,102,241,0.5)] border-none",
                    idx !== 0 && "border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.05)] text-white hover:bg-[rgba(255,255,255,0.1)] hover:border-[rgba(255,255,255,0.4)]"
                  )}
                  key={idx}
                >
                  <Link
                    href={button.url ?? ''}
                    target={button.target ?? '_self'}
                  >
                    {button.icon && <SmartIcon name={button.icon as string} className="mr-2 h-4 w-4" />}
                    <span>{button.title}</span>
                  </Link>
                </Button>
              );
            })}
          </motion.div>
        )}



      </div>
    </section>
  );
}
