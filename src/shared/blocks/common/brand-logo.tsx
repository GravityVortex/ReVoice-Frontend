'use client';

import { Link } from '@/core/i18n/navigation';
import { Brand as BrandType } from '@/shared/types/blocks/common';

import { LazyImage } from './lazy-image';

export function BrandLogo({ brand }: { brand: BrandType }) {
  return (
    <Link
      href={brand.url || '/'}
      target={brand.target || '_self'}
      className={`flex items-center ${brand.className || ''}`}
    >
      <LazyImage
        src="/logo.png"
        alt={brand.logo?.alt || 'SoulDub'}
        className="h-16 w-auto"
      />
    </Link>
  );
}
