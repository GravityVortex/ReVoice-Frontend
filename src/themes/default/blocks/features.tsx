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
      className={cn('py-16 md:py-24', features.className, className)}
    >
      <div className={`container space-y-8 md:space-y-16`}>
        <ScrollAnimation>
          <div className="mx-auto max-w-4xl text-center text-balance">
            <h2 className="text-foreground mb-4 text-3xl font-semibold tracking-tight md:text-4xl">
              {features.title}
            </h2>
            <p className="text-muted-foreground mb-6 md:mb-12 lg:mb-16">
              {features.description}
            </p>
          </div>
        </ScrollAnimation>

        <ScrollAnimation delay={0.2}>
          <div className="relative mx-auto grid divide-x divide-y border *:p-12 sm:grid-cols-2 lg:grid-cols-3">
            {features.items?.map((item, idx) => (
              <div className="space-y-4" key={idx}>
                <div className="flex items-center gap-3">
                  <SmartIcon name={item.icon as string} size={28} />
                  <h3 className="text-lg font-semibold">{item.title}</h3>
                </div>
                <p className="text-base text-muted-foreground leading-relaxed">{item.description}</p>
              </div>
            ))}
          </div>
        </ScrollAnimation>
      </div>
    </section>
  );
}
