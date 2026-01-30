// 控制台布局组件
'use client';

import { ReactNode, useState } from 'react';

import { Link, usePathname } from '@/core/i18n/navigation';
import { SmartIcon } from '@/shared/blocks/common/smart-icon';
import { Button } from '@/shared/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/shared/components/ui/sheet';
import { cn } from '@/shared/lib/utils';
import { Nav } from '@/shared/types/blocks/common';

export function ConsoleLayout({
  title,
  nav,
  topNav,
  className,
  children,
}: {
  title?: string;
  nav?: Nav;
  topNav?: Nav;
  className?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navItems = nav?.items ?? [];
  const topNavItems = topNav?.items ?? [];
  const showTopBar = navItems.length > 0 || topNavItems.length > 0;
  const showModuleTabs = topNavItems.length > 1;

  function NavList({
    onNavigate,
  }: {
    onNavigate?: () => void;
  }) {
    return (
      <nav className="space-y-1">
        {navItems.map((item, idx) => {
          if (item.type === 'section' || !item.url) {
            if (!item.title) return null;
            return (
              <div
                key={`section-${idx}-${item.title}`}
                className="text-muted-foreground/80 px-3 pt-5 pb-2 text-[11px] font-medium tracking-[0.18em] uppercase"
              >
                {item.title}
              </div>
            );
          }

          const isRoot = item.url.split('/').filter(Boolean).length <= 1;
          const isActive = isRoot
            ? pathname === item.url
            : pathname === item.url || pathname.startsWith(`${item.url}/`);

          return (
            <Link
              key={item.url || idx}
              href={item.url}
              onClick={onNavigate}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all',
                isActive
                  ? 'bg-white/5 text-foreground border border-white/10 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
              )}
            >
              {item.icon ? (
                <span
                  aria-hidden
                  className={cn(
                    'flex size-8 items-center justify-center rounded-lg border transition-colors',
                    isActive
                      ? 'border-white/10 bg-white/[0.03]'
                      : 'border-transparent bg-transparent group-hover:border-white/10 group-hover:bg-white/[0.03]'
                  )}
                >
                  <SmartIcon name={item.icon as string} size={16} />
                </span>
              ) : null}
              <span className="min-w-0 flex-1 truncate">{item.title}</span>
              {item.badge ? (
                <span className="text-muted-foreground/80 rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px]">
                  {item.badge}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <div
      className={cn(
        // App-like surface that fills the viewport under the fixed landing header.
        // `box-border` ensures padding does not increase the overall height (avoids page scroll).
        'console-surface bg-background relative min-h-screen pt-[4.5rem]',
        className
      )}
    >
      {/* Ambient background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="absolute -top-56 left-1/2 h-[520px] w-[1200px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-primary/5 to-transparent blur-[80px] opacity-60" />
        <div className="absolute -top-32 right-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-purple-400/10 via-purple-400/0 to-transparent blur-[60px] opacity-60" />
      </div>

      {/* Top bar: mobile nav + (optional) module tabs */}
      {showTopBar ? (
        <div
          className={cn(
            'border-white/10 bg-background/40 z-40 shrink-0 border-b backdrop-blur-xl',
            // When there's no module switcher, the desktop sidebar is enough.
            navItems.length > 0 && !showModuleTabs ? 'md:hidden' : undefined
          )}
        >
          <div className="container">
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-2">
                {/* Mobile nav trigger */}
                {navItems.length > 0 ? (
                  <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="md:hidden rounded-full"
                      onClick={() => setMobileNavOpen(true)}
                    >
                      <SmartIcon name="Menu" size={18} />
                      <span className="sr-only">Open navigation</span>
                    </Button>

                    <SheetContent
                      side="left"
                      className="bg-background/90 border-white/10 p-0 backdrop-blur-xl"
                    >
                      <SheetHeader className="border-white/10 border-b px-4 py-4">
                        <SheetTitle className="text-base">
                          {title || nav?.title || 'Navigation'}
                        </SheetTitle>
                      </SheetHeader>
                      <div className="p-3">
                        <NavList onNavigate={() => setMobileNavOpen(false)} />
                      </div>
                    </SheetContent>
                  </Sheet>
                ) : null}

                {showModuleTabs ? (
                  <nav className="flex items-center gap-1 text-sm">
                    {topNavItems.map((item, idx) => {
                      const isActive =
                        item.is_active || pathname?.startsWith(item.url as string);

                      return (
                        <Link
                          key={item.url || idx}
                          href={item.url || ''}
                          className={cn(
                            'flex items-center gap-2 rounded-full px-3 py-2 transition-colors',
                            isActive
                              ? 'bg-white/[0.06] text-foreground'
                              : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.04]'
                          )}
                        >
                          {item.icon ? (
                            <SmartIcon name={item.icon as string} size={16} />
                          ) : null}
                          {item.title}
                        </Link>
                      );
                    })}
                  </nav>
                ) : (
                  <div className="text-foreground/90 px-2 text-sm font-medium">
                    {title || nav?.title || topNav?.title || 'Navigation'}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      ) : null}

      {/* Main Content */}
      <div className="container relative flex-1 min-h-0">
        <div className="flex h-full gap-6 py-4 md:py-6">
          {/* Desktop sidebar */}
          {navItems.length > 0 ? (
            <aside className="hidden w-72 flex-shrink-0 md:block">
              <div className="bg-card/50 border-white/10 h-full rounded-2xl border p-3 shadow-lg backdrop-blur">
                <NavList />
              </div>
            </aside>
          ) : null}

          {/* Right Content Area */}
          <div className="min-w-0 flex-1 min-h-0 overflow-auto">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
