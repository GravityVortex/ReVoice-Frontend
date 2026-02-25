'use client';

import { ChevronRight } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link } from '@/core/i18n/navigation';
import { SidebarTrigger } from '@/shared/components/ui/sidebar';
import { LocaleSelector, ThemeToggler } from '@/shared/blocks/common';
import { Crumb } from '@/shared/types/blocks/common';
import { SidebarUser as SidebarUserType } from '@/shared/types/blocks/dashboard';

import { UserNav } from './user-nav';

export interface HeaderProps {
  crumbs?: Crumb[];
}

export function Header({ crumbs }: HeaderProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />

        {crumbs && crumbs.length > 0 ? (
          <nav aria-label="Breadcrumb" className="ml-2">
            <ol className="flex items-center gap-1 text-sm text-muted-foreground">
              {crumbs.map((c, idx) => {
                const title = c.title || c.name || c.text || '';
                const isActive = Boolean(c.is_active);
                const href = c.url || '';

                return (
                  <li key={`${idx}-${href}-${title}`} className="flex items-center">
                    {idx > 0 ? (
                      <ChevronRight className="mx-1 h-4 w-4 text-muted-foreground/70" />
                    ) : null}

                    {href && !isActive ? (
                      <Link
                        href={href}
                        target={c.target}
                        className="hover:text-foreground"
                      >
                        {title}
                      </Link>
                    ) : (
                      <span className={isActive ? 'text-foreground' : ''}>
                        {title}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : null}
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-2 px-4">
        <ThemeToggler />
        <LocaleSelector />
      </div>
    </header>
  );
}

export interface DashboardHeaderProps {
  user?: SidebarUserType | null;
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
  const t = useTranslations('common.dashboard.sidebar');

  // Fallback user config if not provided, though typically passed from layout
  const resolvedUser = user ?? {
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
  };

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2 px-4">
        <ThemeToggler />
        <LocaleSelector />
        <UserNav user={resolvedUser} />
      </div>
    </header>
  );
}
