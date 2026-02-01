'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { SmartIcon } from '@/shared/blocks/common/smart-icon';
import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';
import { cn } from '@/shared/lib/utils';
import { Features as FeaturesType } from '@/shared/types/blocks/landing';

type PreviewImage = {
  src: string;
  alt: string;
  title: string;
};

export function FeaturesStep({
  features,
  className,
}: {
  features: FeaturesType;
  className?: string;
}) {
  const t = useTranslations('landing.features_step');
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);

  return (
    <section
      id={features.id}
      className={cn('py-16 md:py-24', features.className, className)}
    >
      <div className="m-4 rounded-[2rem]">
        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-b from-muted/10 via-background to-background">
          {/* Atmosphere: subtle grid + glow so the steps read as a single guided flow */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_circle_at_20%_10%,rgba(99,102,241,0.25),transparent_60%),radial-gradient(900px_circle_at_80%_30%,rgba(16,185,129,0.14),transparent_55%)]" />
          <div className="pointer-events-none absolute inset-0 bg-grid-white/[0.03]" />

          <div className="@container relative container py-14 md:py-20">
            <ScrollAnimation>
              <div className="mx-auto max-w-3xl text-center">
                {features.label && (
                  <span className="text-primary/90 text-sm font-semibold tracking-wide">
                    {features.label}
                  </span>
                )}
                <h2 className="text-foreground mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
                  {features.title}
                </h2>
                {features.description && (
                  <p className="text-muted-foreground mt-4 text-lg text-balance">
                    {features.description}
                  </p>
                )}
              </div>
            </ScrollAnimation>

            <ScrollAnimation delay={0.2}>
              <div className="relative mt-14 md:mt-16">
                <div className="pointer-events-none absolute left-8 right-8 top-6 hidden h-px bg-gradient-to-r from-transparent via-white/15 to-transparent lg:block" />

                <ol className="grid gap-6 lg:grid-cols-3">
                  {features.items?.map((item, idx) => {
                    const stepNo = String(idx + 1).padStart(2, '0');
                    const canPreview = Boolean(item.image?.src);
                    const iconName = typeof item.icon === 'string' ? item.icon : '';

                    return (
                      <li
                        key={`${item.title ?? 'step'}-${idx}`}
                        className="group relative rounded-3xl border border-white/10 bg-background/50 p-6 backdrop-blur-sm"
                      >
                        <div className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/5" />
                        <div className="pointer-events-none absolute -top-12 left-1/2 h-24 w-24 -translate-x-1/2 rounded-full bg-primary/10 blur-2xl opacity-70 transition-opacity duration-300 group-hover:opacity-100" />

                        <div className="relative flex items-start justify-between gap-6">
                          <div className="flex items-center gap-3">
                            <div className="grid h-11 w-11 place-items-center rounded-2xl border border-white/10 bg-black/20">
                              {iconName ? (
                                <SmartIcon
                                  name={iconName}
                                  size={18}
                                  className="text-foreground/80"
                                />
                              ) : (
                                <span className="text-foreground/70 text-sm font-semibold">
                                  {idx + 1}
                                </span>
                              )}
                            </div>

                            <div className="min-w-0">
                              <div className="text-muted-foreground text-xs font-semibold tracking-widest">
                                STEP {stepNo}
                              </div>
                              <h3 className="text-foreground mt-1 text-lg font-semibold tracking-tight">
                                {item.title}
                              </h3>
                            </div>
                          </div>

                          <div className="text-foreground/20 font-mono text-3xl font-black leading-none">
                            {stepNo}
                          </div>
                        </div>

                        {item.description && (
                          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                            {item.description}
                          </p>
                        )}

                        {canPreview && (
                          <button
                            type="button"
                            className="mt-6 block w-full text-left"
                            onClick={() => {
                              if (!item.image?.src) return;
                              setPreviewImage({
                                src: item.image.src,
                                alt: item.image.alt || item.title || t('preview_alt'),
                                title: item.title || t('preview_alt'),
                              });
                            }}
                          >
                            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/8 via-transparent to-transparent" />
                              <img
                                src={item.image!.src}
                                alt={item.image!.alt || item.title}
                                loading="lazy"
                                className="aspect-[16/10] w-full object-cover object-center transition-transform duration-500 group-hover:scale-[1.02]"
                              />
                              <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10" />
                              <div className="pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs text-white/80 backdrop-blur">
                                <span className="h-1.5 w-1.5 rounded-full bg-primary/80" />
                                {t('preview_alt')}
                              </div>
                            </div>
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </div>
            </ScrollAnimation>
          </div>
        </div>
      </div>

      <Dialog
        open={Boolean(previewImage)}
        onOpenChange={(open) => {
          if (!open) setPreviewImage(null);
        }}
      >
        <DialogContent className="max-w-[min(1100px,calc(100%-2rem))] p-0 overflow-hidden">
          {previewImage && (
            <>
              <DialogHeader className="p-6 pb-4">
                <DialogTitle>{previewImage.title}</DialogTitle>
              </DialogHeader>
              <div className="px-6 pb-6">
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                  <img
                    src={previewImage.src}
                    alt={previewImage.alt}
                    className="h-auto w-full object-contain"
                  />
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
