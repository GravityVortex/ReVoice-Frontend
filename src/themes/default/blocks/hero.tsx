'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Play } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { LazyImage, SmartIcon } from '@/shared/blocks/common';
import { AnimatedGridPattern } from '@/shared/components/ui/animated-grid-pattern';
import { Button } from '@/shared/components/ui/button';
import { Highlighter } from '@/shared/components/ui/highlighter';
import { useAppContext } from '@/shared/contexts/app';
import { cn } from '@/shared/lib/utils';
import { Hero as HeroType } from '@/shared/types/blocks/landing';

import { SocialAvatars } from './social-avatars';

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
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [showImageModal, setShowImageModal] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isHovering, setIsHovering] = useState(false);

  // Handle video playback when switching tabs while hovering
  useEffect(() => {
    if (isHovering && videoRef.current) {
      // Small timeout to ensure the new video element is ready
      const timer = setTimeout(() => {
        videoRef.current?.play().catch(() => { });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [activeTab, isHovering]);
  const [imageScale, setImageScale] = useState(1);
  const { user, setIsShowSignModal } = useAppContext();
  const titleText = hero.title ?? '';
  const highlightText = hero.highlight_text ?? '';
  const titleLines = titleText.split(/\r?\n|\\n/);
  const renderHighlightedText = () => (
    <Highlighter action="underline" color="var(--primary)" multiline={false}>
      <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-purple-400">
        {highlightText}
      </span>
    </Highlighter>
  );
  const renderTitle = () => {
    if (!highlightText) {
      return titleLines.map((line, index) => (
        <Fragment key={`hero-title-line-${index}`}>
          {index > 0 && <br />}
          {line}
        </Fragment>
      ));
    }

    if (!titleText.includes(highlightText)) {
      return (
        <>
          {titleLines.map((line, index) => (
            <Fragment key={`hero-title-line-${index}`}>
              {index > 0 && <br />}
              {line}
            </Fragment>
          ))}
          {renderHighlightedText()}
        </>
      );
    }

    let highlighted = false;

    return titleLines.map((line, index) => {
      let content: ReactNode = line;
      if (!highlighted) {
        const highlightIndex = line.indexOf(highlightText);
        if (highlightIndex !== -1) {
          highlighted = true;
          content = (
            <>
              {line.slice(0, highlightIndex)}
              {renderHighlightedText()}
              {line.slice(highlightIndex + highlightText.length)}
            </>
          );
        }
      }

      return (
        <Fragment key={`hero-title-line-${index}`}>
          {index > 0 && <br />}
          {content}
        </Fragment>
      );
    });
  };

  const videos = [
    'https://pub-9e01d229159844cfbe7379d010d2fb61.r2.dev/dev/landing/fanren-1.mp4',
    'https://pub-9e01d229159844cfbe7379d010d2fb61.r2.dev/dev/landing/fanren-2.mp4',
    'https://pub-9e01d229159844cfbe7379d010d2fb61.r2.dev/dev/landing/fanren-3.mp4',
  ];
  const covers = [
    '/imgs/landing/fanren-1-cover.png',
    '/imgs/landing/fanren-2-cover.png',
    '/imgs/landing/fanren-3-cover.png',
  ];
  const defaultVideoTabs = ['Case 1', 'Case 2', 'Case 3'];
  const videoTabs =
    hero.video_tabs?.length === defaultVideoTabs.length
      ? hero.video_tabs
      : defaultVideoTabs;

  const handleButtonClick = (e: React.MouseEvent, url: string) => {
    if (url === '/video_convert' && !user) {
      e.preventDefault();
      setIsShowSignModal(true);
    }
  };

  return (
    <section
      id={hero.id}
      className={cn(
        'relative w-full overflow-hidden pt-32 pb-20 md:pt-40 md:pb-32',
        hero.className,
        className
      )}
    >
      {/* Background Ambience */}
      <div className="absolute top-0 left-1/2 -ml-[50vw] w-[100vw] h-[600px] bg-primary/20 blur-[120px] rounded-full opacity-20 pointer-events-none" />
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

      <div className="container relative z-10 mx-auto px-4 md:px-6">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20 items-center">
          {/* Left Column: Content */}
          <div className="flex flex-col items-center text-center lg:items-start lg:text-left">
            {hero.announcement && (
              <motion.div {...createFadeInVariant(0)}>
                <Link
                  href={hero.announcement.url || ''}
                  target={hero.announcement.target || '_self'}
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/10 text-xs font-medium text-primary hover:bg-primary/20 transition-colors mb-6"
                >
                  <span>{hero.announcement.title}</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </motion.div>
            )}

            <motion.div {...createFadeInVariant(0.15)}>
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-6xl md:text-7xl lg:text-6xl xl:text-7xl leading-[1.1] text-foreground">
                {renderTitle()}
              </h1>
            </motion.div>

            <motion.p
              {...createFadeInVariant(0.3)}
              className="mt-6 text-lg text-muted-foreground max-w-[600px] leading-relaxed"
              dangerouslySetInnerHTML={{ __html: hero.description ?? '' }}
            />

            {hero.buttons && (
              <motion.div
                {...createFadeInVariant(0.45)}
                className="mt-8 flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto"
              >
                {hero.buttons.map((button, idx) => (
                  <Button
                    asChild
                    size="lg"
                    variant={idx === 0 ? 'default' : 'outline'}
                    className={cn(
                      "w-full sm:w-auto text-base h-12 px-8",
                      idx === 0 && "bg-primary hover:bg-primary/90 shadow-[0_0_20px_-5px_var(--primary)] text-primary-foreground border-none",
                      idx !== 0 && "border-primary/20 text-foreground hover:bg-primary/5 hover:text-primary backdrop-blur-sm"
                    )}
                    key={idx}
                  >
                    <Link
                      href={button.url ?? ''}
                      target={button.target ?? '_self'}
                      onClick={(e) => handleButtonClick(e, button.url ?? '')}
                    >
                      {button.icon && <SmartIcon name={button.icon as string} className="mr-2 h-4 w-4" />}
                      <span>{button.title}</span>
                    </Link>
                  </Button>
                ))}
              </motion.div>
            )}

            {hero.show_avatars && (
              <motion.div {...createFadeInVariant(0.6)} className="mt-8">
                <SocialAvatars tip={hero.avatars_tip || ''} />
              </motion.div>
            )}

            {hero.tip && (
              <motion.p
                {...createFadeInVariant(0.7)}
                className="text-muted-foreground mt-4 text-xs"
                dangerouslySetInnerHTML={{ __html: hero.tip ?? '' }}
              />
            )}
          </div>

          {/* Right Column: Visual/Video */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="relative mx-auto w-full max-w-[600px] lg:max-w-none"
          >
            {/* Glow Effect behind card */}
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-r from-primary to-purple-600 opacity-30 blur-2xl" />

            {/* Mac Window Container - Flex Layout for Perfect Fit */}
            <div
              className="relative rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md shadow-2xl overflow-hidden flex flex-col cursor-zoom-in group/container"
              onClick={() => {
                setIsPlaying(false);
                setShowImageModal(true);
              }}
              onMouseEnter={() => {
                setIsHovering(true);
                if (videoRef.current) {
                  videoRef.current.play().catch(() => { });
                }
              }}
              onMouseLeave={() => {
                setIsHovering(false);
                if (videoRef.current) {
                  videoRef.current.pause();
                  videoRef.current.currentTime = 0;
                }
              }}
            >
              {/* Mac Header */}
              <div className="h-10 bg-white/5 border-b border-white/5 flex items-center px-4 space-x-2 z-20 backdrop-blur-md shrink-0">
                <div className="w-3 h-3 rounded-full bg-red-500/80 shadow-sm" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80 shadow-sm" />
                <div className="w-3 h-3 rounded-full bg-green-500/80 shadow-sm" />
                <div className="ml-4 flex-1 h-2 bg-white/10 rounded-full max-w-[200px]" />
              </div>

              {/* Video Area */}
              <div className="relative w-full aspect-video bg-black/20">
                <video
                  ref={videoRef}
                  key={activeTab}
                  className="w-full h-full object-contain relative z-20"
                  src={videos[activeTab]}
                  poster={covers[activeTab]}
                  controls={false}
                  muted
                  playsInline
                  loop
                />

                {/* Initial Play Button Overlay (Visible by default, fades out on hover) */}
                <div className="absolute inset-0 z-25 flex items-center justify-center transition-opacity duration-300 group-hover/container:opacity-0 pointer-events-none">
                  <div className="w-16 h-16 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-2xl">
                    <Play className="w-6 h-6 fill-white text-white ml-1" />
                  </div>
                </div>

                {/* Cinema Mode Hint Overlay (Hidden by default, fades in on hover) */}
                <div className="absolute inset-0 z-30 flex items-center justify-center opacity-0 group-hover/container:opacity-100 transition-opacity duration-300 bg-black/20 backdrop-blur-[1px]">
                  <div className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-black/70 border border-white/20 backdrop-blur-lg text-white font-medium transform translate-y-4 group-hover/container:translate-y-0 transition-transform shadow-2xl">
                    <Play className="w-4 h-4 fill-white" />
                    <span>{hero.cinema_hint}</span>
                  </div>
                </div>

                {/* Tab Switcher - Floating bottom */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1 p-1 bg-black/60 backdrop-blur-xl rounded-full border border-white/10 z-40 shadow-xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  {videoTabs.map((label, idx) => (
                    <button
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveTab(idx);
                      }}
                      className={cn(
                        'px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-300',
                        activeTab === idx
                          ? 'bg-primary text-primary-foreground shadow-md'
                          : 'text-white/70 hover:bg-white/10 hover:text-white'
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Backlight/Ambience */}
              <div className="absolute inset-0 -z-10">
                <img src={covers[activeTab]} className="w-full h-full object-cover opacity-60 blur-[60px] scale-125" alt="" />
              </div>
            </div>

            {/* Decorative Elements */}
            <div className="absolute -top-10 -right-10 w-24 h-24 bg-purple-500/20 rounded-full blur-2xl animate-pulse" />
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-primary/20 rounded-full blur-3xl animate-pulse" />
          </motion.div>
        </div>
      </div>

      {showImageModal && (
        <div
          className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center backdrop-blur-md animate-in fade-in duration-300"
          onClick={() => {
            setShowImageModal(false);
            setIsPlaying(false);
          }}
        >
          <div className="absolute top-6 right-6 z-[110]">
            <Button
              variant="ghost"
              size="icon"
              className="hover:bg-white/10 rounded-full w-12 h-12"
              onClick={() => {
                setShowImageModal(false);
                setIsPlaying(false);
              }}
            >
              <span className="text-white/80 hover:text-white text-4xl font-light">&times;</span>
            </Button>
          </div>

          <div
            className="relative w-full h-full max-w-[90vw] max-h-[85vh] p-4 flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              className="max-w-full max-h-full rounded-xl shadow-2xl border border-white/10"
              src={videos[activeTab]}
              controls
              autoPlay
              playsInline
            />
          </div>
        </div>
      )}
    </section>
  );
}
