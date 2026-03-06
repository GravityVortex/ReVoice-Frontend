import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { ConsoleLayout } from '@/shared/blocks/console/layout';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function VideoConvertLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations('video_convert.sidebar');

  // settings title
  const title = t('title');

  // settings nav
  // const nav = t.raw('nav');

  const topNav = t.raw('top_nav');
  // const topNav = 'xxx';

  return (
    <ConsoleLayout
      // title={title}
      // nav={nav}
      topNav={topNav}
    >
      {children}
    </ConsoleLayout>
  );
}
