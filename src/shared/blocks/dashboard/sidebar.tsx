// Dashboard/Admin sidebar shell.
//
// IMPORTANT:
// - Admin sidebar config (`admin/sidebar.json`) uses nested nav items (`children`).
// - Keep this component compatible with both:
//   1) Admin layout (server) -> passes a fully-featured `sidebar` config
//   2) Dashboard layout (client) -> uses this component without props
//
// We intentionally reuse the existing shadcn-style sidebar primitives + our `Nav` block
// to avoid duplicating navigation rendering logic.
'use client';

import { useTranslations } from 'next-intl';

import {
  Sidebar as SidebarShell,
  SidebarContent,
  SidebarFooter as SidebarShellFooter,
  SidebarRail,
} from '@/shared/components/ui/sidebar';
import { cn } from '@/shared/lib/utils';
import { type Sidebar as SidebarType } from '@/shared/types/blocks/dashboard';

import { Nav } from './nav';
import { SidebarButtons } from './sidebar-buttons';
import { SidebarFooter } from './sidebar-footer';
import { SidebarHeader } from './sidebar-header';
import { SidebarUser } from './sidebar-user';

export function Sidebar({
  sidebar,
  variant,
  className,
}: {
  sidebar?: SidebarType;
  variant?: SidebarType['variant'];
  className?: string;
}) {
  const t = useTranslations('common.dashboard.sidebar');

  // Fallback config for the dashboard area (used when `sidebar` isn't provided).
  // Keep it minimal and fully locale-safe.
  const resolvedSidebar: SidebarType = sidebar ?? {
    header: {
      brand: {
        title: 'SoulDub',
        logo: { src: '/logo.png', alt: 'SoulDub' },
        url: '/',
      },
      show_trigger: false,
    },
    main_navs: [
      {
        items: [
          {
            title: t('workstation'),
            url: '/dashboard',
            icon: 'LayoutDashboard',
          },
          {
            title: t('projects'),
            url: '/dashboard/projects',
            icon: 'Video',
          },
          {
            title: t('create'),
            url: '/dashboard/create',
            icon: 'PlusCircle',
          },
        ],
      },
    ],
    user: {
      show_email: false,
      show_signout: true,
      signin_callback: '/dashboard',
      signout_callback: '/',
      nav: {
        items: [
          {
            title: t('user_nav.billing'),
            url: '/settings/billing',
            icon: 'CreditCard',
          },
        ],
      },
    },
    variant: 'floating',
    collapsible: 'icon',
  };

  const mainNavs = resolvedSidebar.main_navs ?? [];
  const bottomNav = resolvedSidebar.bottom_nav;

  return (
    <SidebarShell
      variant={variant ?? resolvedSidebar.variant ?? 'sidebar'}
      collapsible={resolvedSidebar.collapsible ?? 'offcanvas'}
      className={cn(
        'dashboard-sidebar',
        // Glassmorphism overrides
        '[&>[data-sidebar=sidebar]]:!bg-card/50',
        '[&>[data-sidebar=sidebar]]:!backdrop-blur-xl',
        '[&>[data-sidebar=sidebar]]:!border-white/10',
        '[&>[data-sidebar=sidebar]]:!border',
        '[&>[data-sidebar=sidebar]]:shadow-lg',
        className
      )}
    >
      {resolvedSidebar.header ? <SidebarHeader header={resolvedSidebar.header} /> : null}

      <SidebarContent>
        {resolvedSidebar.buttons && resolvedSidebar.buttons.length > 0 ? (
          <SidebarButtons buttons={resolvedSidebar.buttons} />
        ) : null}

        {mainNavs.map((nav, idx) => (
          <Nav key={nav.id || nav.title || String(idx)} nav={nav} />
        ))}

        {bottomNav ? <Nav nav={bottomNav} className="mt-auto" /> : null}
      </SidebarContent>

      {(resolvedSidebar.user || resolvedSidebar.footer) ? (
        <SidebarShellFooter className="p-0 border-t border-white/10">
          {resolvedSidebar.user ? <SidebarUser user={resolvedSidebar.user} /> : null}
          {resolvedSidebar.footer ? <SidebarFooter footer={resolvedSidebar.footer} /> : null}
        </SidebarShellFooter>
      ) : null}

      <SidebarRail />
    </SidebarShell>
  );
}

// Backward-compat export name used across the app.
export { Sidebar as DashboardSidebar };
