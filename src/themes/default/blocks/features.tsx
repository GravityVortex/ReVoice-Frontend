'use client';

import { SmartIcon } from '@/shared/blocks/common/smart-icon';
import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';
import { cn } from '@/shared/lib/utils';
import { Features as FeaturesType } from '@/shared/types/blocks/landing';

export function Features({
  features,
  className,
}: {
  features: FeaturesType;
  className?: string;
}) {
  return (
    <section
      id={features.id}
      className={cn('py-16 md:py-24 bg-black', features.className, className)}
    >
      <div className={`container space-y-8 md:space-y-16`}>
        <ScrollAnimation>
          <div className="mx-auto max-w-4xl text-center text-balance">
            <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary mb-4">
              Features
            </div>
            <h2 className="text-white mb-4 text-3xl font-bold tracking-tight md:text-5xl">
              {features.title}
            </h2>
            <p className="text-white/60 mb-6 md:mb-12 lg:mb-16 text-lg">
              {features.description}
            </p>
          </div>
        </ScrollAnimation>

        <ScrollAnimation delay={0.2}>
          <div className="mx-auto grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.items?.map((item, idx) => (
              <div
                className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-8 transition-all hover:bg-white/10 hover:shadow-2xl hover:shadow-primary/5"
                key={idx}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

                <div className="relative z-10">
                  <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/20 text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                    <SmartIcon name={item.icon as string} size={24} />
                  </div>
                  <h3 className="mb-3 text-xl font-bold text-white">{item.title}</h3>
                  <p className="text-base text-white/60 leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </ScrollAnimation>
      </div>
    </section>
  );
}
