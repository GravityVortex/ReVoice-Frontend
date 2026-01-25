import { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { getThemeLayout } from '@/core/theme';
import { SocialCreditsHandler } from '@/shared/blocks/sign/social-credits-handler';
import {
  Footer as FooterType,
  Header as HeaderType,
} from '@/shared/types/blocks/landing';

export default async function LandingLayout({
  children,
}: {
  children: ReactNode;
}) {
  // load page data
  const t = await getTranslations('landing');

  /**
   * 通过 getThemeLayout 函数动态加载主题的 landing 布局
   * 实际加载的就是 src/themes/default/layouts/landing.tsx
   */
  const Layout = await getThemeLayout('landing');

  // header and footer to display
  const header: HeaderType = t.raw('header');
  const footer: FooterType = t.raw('footer');

  return (
    <Layout header={header} footer={footer}>
      <SocialCreditsHandler />
      {children}
    </Layout>
  );
}
