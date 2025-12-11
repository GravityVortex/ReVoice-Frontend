/**
  
  在src/app/[locale]/(landing)/layout.tsx页面通过以下代码：

  const Layout = await getThemeLayout('landing');
  <Layout header={header} footer={footer}>
    ...
  </Layout>
  
  通过 getThemeLayout 函数动态加载主题的 landing 布局
  实际加载的就是 src/themes/default/layouts/landing.tsx
 */
import { ReactNode } from 'react';

import {
  Footer as FooterType,
  Header as HeaderType,
} from '@/shared/types/blocks/landing';
import { Footer, Header } from '@/themes/default/blocks';

export default async function LandingLayout({
  children,
  header,
  footer,
}: {
  children: ReactNode;
  header: HeaderType;
  footer: FooterType;
}) {
  return (
    <div className="h-screen w-screen">
      <Header header={header} />
      {children}
      <Footer footer={footer} />
    </div>
  );
}
