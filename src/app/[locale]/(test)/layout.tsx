import { ReactNode } from 'react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

import { requireAdminAccess } from '@/core/rbac/permission';
import { LocaleDetector } from '@/shared/blocks/common';
import { DashboardLayout } from '@/shared/blocks/dashboard/layout';
import { Sidebar as SidebarType } from '@/shared/types/blocks/dashboard';

/**
 * test layout to manage datas
 */
export default async function TestLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requireAdminAccess({
    redirectUrl: `/no-permission`,
    locale: locale || '',
  });

  const t = await getTranslations('test');

  const sidebar: SidebarType = t.raw('sidebar');

  return (
    // 左侧菜单导航栏，右侧内容布局
    <DashboardLayout sidebar={sidebar}>
      {/* 语言检测，不匹配提示用户切换 */}
      <LocaleDetector />
      {children}
    </DashboardLayout>
  );
}
