'use client';

import { Settings } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/core/i18n/navigation';
import { cn } from '@/shared/lib/utils';
import { LazyImage } from "@/shared/blocks/common/lazy-image";
import { useAppContext } from '@/shared/contexts/app';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar';
import { Skeleton } from "@/shared/components/ui/skeleton";

import { Sidebar as SidebarType } from '@/shared/types/blocks/dashboard';
import { SmartIcon } from '@/shared/blocks/common';
import { SignUser } from '@/shared/blocks/common';

interface SidebarProps {
  className?: string;
  sidebar?: SidebarType;
  variant?: string;
}

export function Sidebar({ className, sidebar }: SidebarProps) {
  const pathname = usePathname();
  const t = useTranslations('common.dashboard.sidebar');
  const { user, isCheckSign } = useAppContext();

  const defaultNavItems = [
    {
      title: t('workstation'),
      href: "/dashboard",
      icon: "LayoutDashboard",
      exact: true,
    },
    {
      title: t('projects'),
      href: "/dashboard/projects",
      icon: "Video",
      exact: false,
    },
    {
      title: t('create'),
      href: "/dashboard/create",
      icon: "PlusCircle",
      exact: false,
    }
  ];

  // Merge logic: use props if available, else default
  // Flattening main_navs for simplicity or use the first nav group
  const navGroups = sidebar?.main_navs || [{ items: defaultNavItems }];

  return (
    <div className={cn("sticky top-0 flex h-screen w-64 flex-col border-r border-border/40 bg-gradient-to-b from-card/50 to-background/95 backdrop-blur-sm", className)}>
      {/* Header / Logo */}
      <div className="flex h-20 items-center px-6 border-b border-border/40">
        <Link href="/" className="flex items-center transition-opacity hover:opacity-80">
          <LazyImage src="/logo.png" alt="SoulDub" className="h-23 w-auto" />
        </Link>
      </div>

      {/* Nav Items */}
      <div className="flex-1 overflow-y-auto py-6 px-4">
        <nav className="space-y-6">
          {navGroups.map((group, gIndex) => (
            <div key={gIndex} className="space-y-2">
              {group.items?.map((item: any) => {
                const href = item.url || item.href;
                const isActive = item.exact
                  ? pathname === href || pathname === `${href}/`
                  : pathname?.startsWith(href);

                return (
                  <Link
                    key={href}
                    href={href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-primary/15 text-primary shadow-sm scale-[1.02]"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground hover:scale-[1.01]"
                    )}
                  >
                    <SmartIcon name={item.icon} className="h-5 w-5 shrink-0" />
                    <span>{item.title}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* User Footer - Fixed at bottom */}
      <div className="mt-auto border-t border-border/40 p-4">
        {isCheckSign ? (
          <Skeleton className="h-16 w-full rounded-xl" />
        ) : (
          <SignUser
            userNav={{
              show_credits: true,
              show_sign_out: true,
              items: [
                {
                  title: t('user_nav.billing'),
                  url: '/settings/billing',
                  icon: 'CreditCard'
                },
                {
                  title: t('user_nav.activity'),
                  url: '/activity',
                  icon: 'Activity'
                }
              ]
            }}
            showStartCreate={false}
          >
            <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-muted/60 transition-colors cursor-pointer group outline-none">
              <Avatar className="h-10 w-10 border-2 border-border/50 shadow-sm">
                <AvatarImage src={user?.image || ''} alt={user?.name || ''} />
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {user?.name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 text-left overflow-hidden">
                <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">
                  {user?.name || 'User'}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {user?.email || ''}
                </p>
              </div>
              <Settings className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </SignUser>
        )}
      </div>
    </div>
  );
}

// Keep export for backward compatibility if needed, though Sidebar is the main one now
export { Sidebar as DashboardSidebar };
