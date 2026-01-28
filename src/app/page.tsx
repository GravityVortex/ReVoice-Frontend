import { redirect } from 'next/navigation';

import { defaultLocale } from '@/config/locale';

export default function RootPage() {
  // All app routes live under `/{locale}/...` (see `localePrefix = 'always'`).
  // Keep `/` from 404ing even if middleware is bypassed.
  redirect(`/${defaultLocale}`);
}

