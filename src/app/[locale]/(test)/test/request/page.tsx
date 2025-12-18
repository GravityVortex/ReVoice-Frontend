import { getTranslations } from 'next-intl/server';
import { PERMISSIONS, requirePermission } from '@/core/rbac';
import { Header, Main, MainHeader } from '@/shared/blocks/dashboard';
import { Crumb } from '@/shared/types/blocks/common';
import RequestTestClient from './request-test-client';

export default async function TestRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    page?: number;
    pageSize?: number;
    email?: string;
  }>;
}) {
  const { locale } = await params;

  // Check if user has permission to read users
  await requirePermission({
    code: PERMISSIONS.USERS_READ,
    redirectUrl: '/admin/no-permission',
    locale,
  });

  // const t = await getTranslations('admin.users');

  const crumbs: Crumb[] = [
    { title: '测试', url: '/test' },
    { title: '接口测试', is_active: true },
  ];

  return (
    <>
      {/* 面包片导航栏 */}
      <Header crumbs={crumbs} />
      <Main>
        <MainHeader title="接口测试" />
        {/* 客户端组件 */}
        <RequestTestClient />
      </Main>
    </>
  );
}
