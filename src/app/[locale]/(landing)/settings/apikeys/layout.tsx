import { ReactNode } from 'react';
import { notFound } from 'next/navigation';

import { PERMISSIONS } from '@/core/rbac';
import { getSignUser } from '@/shared/models/user';
import { hasPermission } from '@/shared/services/rbac';

export default async function ApiKeysLayout({ children }: { children: ReactNode }) {
  const user = await getSignUser();
  if (!user) {
    notFound();
  }

  const isAdmin = await hasPermission(user.id, PERMISSIONS.ADMIN_ACCESS).catch(() => false);
  if (!isAdmin) {
    notFound();
  }

  return children;
}

