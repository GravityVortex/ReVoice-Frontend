'use client';

import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';
import { Stats as StatsType } from '@/shared/types/blocks/landing';

export function Stats({
  stats,
  className,
}: {
  stats: StatsType;
  className?: string;
}) {
  return (
    <section
      id={stats.id}
      className={`py-12 bg-black ${stats.className} ${className}`}
    >
      <div className="container px-4 md:px-6">
        <ScrollAnimationWrapper>
          <div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-8 md:p-12 backdrop-blur-md shadow-2xl">
            {/* Glow effect */}
            <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-primary/20 blur-[100px] rounded-full pointer-events-none" />

            <div className="grid gap-12 lg:grid-cols-2 items-center relative z-10">
              {/* Left: Text/Testimonial-like content */}
              <div className="text-left space-y-6">
                <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight leading-tight">
                  {stats.title}
                </h2>
                <p className="text-lg text-white/70 leading-relaxed max-w-md">
                  {stats.description}
                </p>

                <div className="flex items-center gap-4 pt-4">
                  <div className="flex -space-x-3">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className="w-10 h-10 rounded-full border-2 border-black bg-neutral-500" style={{ backgroundImage: `url(https://i.pravatar.cc/100?img=${i + 10})`, backgroundSize: 'cover' }} />
                    ))}
                  </div>
                  <div className="text-sm font-medium text-white">
                    <span className="text-yellow-400">★★★★★</span> <span className="text-white/60 ml-2">from 10,000+ users</span>
                  </div>
                </div>
              </div>

              {/* Right: Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                {stats.items?.map((item, idx) => (
                  <div key={idx} className="flex flex-col gap-2">
                    <div className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-br from-white to-white/50">
                      {item.title}
                    </div>
                    <div className="text-sm font-medium text-white/50 uppercase tracking-wider">
                      {item.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ScrollAnimationWrapper>
      </div>
    </section>
  );
}

// Wrapper to fix missing default export issue or just use standard div if ScrollAnimation is default
function ScrollAnimationWrapper({ children }: { children: React.ReactNode }) {
  return <ScrollAnimation>{children}</ScrollAnimation>;
}
