import { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';

import { PERMISSIONS } from '@/core/rbac';
import { ConsoleLayout } from '@/shared/blocks/console/layout';
import { getSignUser } from '@/shared/models/user';
import { hasPermission } from '@/shared/services/rbac';

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getTranslations('settings.sidebar');

  // settings title
  const title = t('title');

  // settings nav
  const rawNav = t.raw('nav') as any;
  const navItems = Array.isArray(rawNav?.items) ? rawNav.items : [];

  const user = await getSignUser();
  const isAdmin = user
    ? await hasPermission(user.id, PERMISSIONS.ADMIN_ACCESS).catch(() => false)
    : false;

  // Hide not-ready areas from end users (keep routes for later, but don't surface them).
  const hiddenUrls = new Set<string>([
    '/settings/security', // coming soon
  ]);
  if (!isAdmin) {
    hiddenUrls.add('/settings/apikeys');
  }

  const filteredNavItems = navItems.filter((item: any) => {
    const url = item?.url;
    return typeof url === 'string' ? !hiddenUrls.has(url) : true;
  });

  // Remove empty section headers (e.g. "Developer" with no items).
  const cleanedNavItems: any[] = [];
  for (let i = 0; i < filteredNavItems.length; i++) {
    const item = filteredNavItems[i];
    if (item?.type !== 'section') {
      cleanedNavItems.push(item);
      continue;
    }

    // Keep a section label only if there is at least one real item before the next section.
    let hasFollowingItem = false;
    for (let j = i + 1; j < filteredNavItems.length; j++) {
      const next = filteredNavItems[j];
      if (next?.type === 'section') break;
      hasFollowingItem = true;
      break;
    }
    if (hasFollowingItem) {
      cleanedNavItems.push(item);
    }
  }

  const nav = { ...rawNav, items: cleanedNavItems };

  return (
    <ConsoleLayout
      title={title}
      nav={nav}
    >
      {children}
    </ConsoleLayout>
  );
}
