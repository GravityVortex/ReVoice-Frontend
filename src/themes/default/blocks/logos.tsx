'use client';

import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';
import { cn } from '@/shared/lib/utils';
import { Logos as LogosType } from '@/shared/types/blocks/landing';

export function Logos({
  logos,
  className,
}: {
  logos: LogosType;
  className?: string;
}) {
  return (
    <section
      id={logos.id}
      className={cn('py-12 bg-black border-y border-[rgba(255,255,255,0.05)] overflow-hidden', logos.className, className)}
    >
      <div className="container px-4 md:px-6 mb-8 text-center">
        <p className="text-sm font-medium text-[rgba(255,255,255,0.4)] uppercase tracking-widest">{logos.title}</p>
      </div>

      <div className="relative w-full overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-20 md:w-40 bg-gradient-to-r from-black to-transparent z-10" />
        <div className="absolute inset-y-0 right-0 w-20 md:w-40 bg-gradient-to-l from-black to-transparent z-10" />

        <div className="flex w-max items-center gap-12 animate-scroll pl-4">
          {/* Duplicate items for seamless loop */}
          {[...Array(4)].map((_, i) => (
            <div key={i} className="flex items-center gap-12">
              {logos.items?.map((item, idx) => (
                <div key={idx} className="relative h-8 w-32 grayscale opacity-50 hover:opacity-100 hover:grayscale-0 transition-all duration-300">
                  <img
                    className="h-full w-full object-contain invert"
                    src={item.image?.src ?? ''}
                    alt={item.image?.alt ?? ''}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <style jsx global>{`
        @keyframes scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .animate-scroll {
          animation: scroll 40s linear infinite;
        }
      `}</style>
    </section>
  );
}
