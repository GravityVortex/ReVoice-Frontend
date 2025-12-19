import { PERMISSIONS, requirePermission } from '@/core/rbac';
import { Header, Main, MainHeader } from '@/shared/blocks/dashboard';
import { Crumb } from '@/shared/types/blocks/common';
import ClientUserVideo from './client-user-video';

export default async function UserVideoManagerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  await requirePermission({
    code: PERMISSIONS.USERS_READ,
    redirectUrl: '/admin/no-permission',
    locale,
  });

  const crumbs: Crumb[] = [
    { title: '测试', url: '/test' },
    { title: '用户视频管理', is_active: true },
  ];

  return (
    <>
      <Header crumbs={crumbs} />
      <Main>
        <MainHeader title="用户视频管理" />
        <ClientUserVideo />
      </Main>
    </>
  );
}
