'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, ArrowRight } from 'lucide-react';

import { Link } from '@/core/i18n/navigation';
import { cn } from '@/shared/lib/utils';
import { Showcases as ShowcasesType } from '@/shared/types/blocks/landing';

export function Showcases({
  showcases,
  className,
}: {
  showcases: ShowcasesType;
  className?: string;
}) {
  const [activeTab, setActiveTab] = useState(0);
  const items = showcases.items || [];

  return (
    <section
      id={showcases.id}
      className={cn('py-24 relative overflow-hidden bg-black', showcases.className, className)}
    >
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[500px] bg-primary/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="container relative z-10 mx-auto px-4 md:px-6">
        <div className="mx-auto mb-16 text-center max-w-3xl">
          {showcases.sr_only_title && (
            <h1 className="sr-only">{showcases.sr_only_title}</h1>
          )}
          <h2 className="mb-6 text-3xl font-bold tracking-tight lg:text-5xl text-white">
            {showcases.title}
          </h2>
          <p className="text-white/60 text-lg">
            {showcases.description}
          </p>
        </div>

        {/* Custom Tabs */}
        <div className="flex flex-wrap justify-center gap-2 mb-12">
          {items.map((item, index) => (
            <button
              key={index}
              onClick={() => setActiveTab(index)}
              className={cn(
                "px-6 py-2.5 rounded-full text-sm font-medium transition-all duration-300 border",
                activeTab === index
                  ? "bg-white text-black border-white shadow-[0_0_20px_-5px_rgba(255,255,255,0.5)] scale-105"
                  : "bg-white/5 text-white/70 border-white/10 hover:bg-white/10 hover:text-white"
              )}
            >
              {(item.title || '').split('：')[0] || item.title}
            </button>
          ))}
        </div>

        {/* Active Content Display */}
        <div className="relative max-w-5xl mx-auto min-h-[400px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="w-full"
            >
              <div className="relative group overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md">
                {/* Aspect Ratio Container for Video/Image */}
                <div className="aspect-video w-full bg-black/50 relative">
                  {items[activeTab]?.image?.src ? (
                    <img
                      src={items[activeTab].image?.src}
                      alt={items[activeTab].image?.alt}
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-60 transition-opacity duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-white/20 bg-neutral-900">No Preview</div>
                  )}

                  {/* Play Button Overlay */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-20 h-20 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center border border-white/20 transition-transform duration-300 group-hover:scale-110 cursor-pointer shadow-2xl">
                      <Play className="w-8 h-8 text-white fill-white ml-1" />
                    </div>
                  </div>

                  {/* Content Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/90 via-black/50 to-transparent">
                    <h3 className="text-2xl font-bold text-white mb-2">{items[activeTab].title}</h3>
                    <p className="text-white/80 max-w-2xl">{items[activeTab].description}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
