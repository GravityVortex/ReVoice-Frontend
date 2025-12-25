'use client';

import { useState } from 'react';
import { ArrowBigRight } from 'lucide-react';

import { SmartIcon } from '@/shared/blocks/common/smart-icon';
import { ScrollAnimation } from '@/shared/components/ui/scroll-animation';
import { cn } from '@/shared/lib/utils';
import { Features as FeaturesType } from '@/shared/types/blocks/landing';

export function FeaturesStep({
  features,
  className,
}: {
  features: FeaturesType;
  className?: string;
}) {
  const [showImageModal, setShowImageModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState('');
  const [imageScale, setImageScale] = useState(1);

  return (
    <section
      id={features.id}
      className={cn('py-16 md:py-24', features.className, className)}
    >
      <div className="m-4 rounded-[2rem]">
        <div className="@container relative container">
          <ScrollAnimation>
            <div className="mx-auto max-w-2xl text-center">
              <span className="text-primary">{features.label}</span>
              <h2 className="text-foreground mt-4 text-4xl font-semibold">
                {features.title}
              </h2>
              <p className="text-muted-foreground mt-4 text-lg text-balance">
                {features.description}
              </p>
            </div>
          </ScrollAnimation>

          <ScrollAnimation delay={0.2}>
            <div className="mt-20 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
              {features.items?.map((item, idx) => {
                const bgColors = [
                  'bg-yellow-100 dark:bg-yellow-900/20',
                  'bg-purple-100 dark:bg-purple-900/20',
                  'bg-pink-100 dark:bg-pink-900/20',
                  'bg-blue-100 dark:bg-blue-900/20',
                  'bg-green-100 dark:bg-green-900/20',
                ];
                return (
                  <div key={idx} className={cn('rounded-3xl p-8 space-y-4', bgColors[idx % bgColors.length])}>
                    <div className="text-6xl font-bold opacity-40">
                      {String(idx + 1).padStart(2, '0')}
                    </div>
                    {item.image?.src && (
                      <img
                        src={item.image.src}
                        alt={item.image.alt || item.title}
                        className="w-full rounded-2xl cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => {
                          if (item.image?.src) {
                            setSelectedImage(item.image.src);
                            setShowImageModal(true);
                            setImageScale(1);
                          }
                        }}
                      />
                    )}
                    <h3 className="text-foreground text-xl font-semibold">
                      {item.title}
                    </h3>
                    <p className="text-muted-foreground text-sm">
                      {item.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </ScrollAnimation>
        </div>
      </div>

      {showImageModal && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setShowImageModal(false)}
        >
          <button
            onClick={() => setShowImageModal(false)}
            className="absolute top-4 right-4 text-white text-2xl hover:text-gray-300"
          >
            ✕
          </button>
          <div className="flex gap-2 absolute top-4 left-1/2 -translate-x-1/2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setImageScale(s => Math.max(0.5, s - 0.25));
              }}
              className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded"
            >
              缩小
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setImageScale(1);
              }}
              className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded"
            >
              重置
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setImageScale(s => Math.min(3, s + 0.25));
              }}
              className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded"
            >
              放大
            </button>
          </div>
          <img
            src={selectedImage}
            alt="预览图"
            className="max-w-[90vw] max-h-[90vh] object-contain transition-transform"
            style={{ transform: `scale(${imageScale})` }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </section>
  );
}
