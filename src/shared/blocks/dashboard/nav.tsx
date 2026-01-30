'use client';

import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';

import { Link, usePathname, useRouter } from '@/core/i18n/navigation';
import { SmartIcon } from '@/shared/blocks/common/smart-icon';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/shared/components/ui/collapsible';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from '@/shared/components/ui/sidebar';
import { cn } from '@/shared/lib/utils';
import { NavItem, type Nav as NavType } from '@/shared/types/blocks/common';

export function Nav({ nav, className }: { nav: NavType; className?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <SidebarGroup className={className}>
      <SidebarGroupContent className="mt-0 flex flex-col gap-2">
        {nav.title && <SidebarGroupLabel>{nav.title}</SidebarGroupLabel>}
        <SidebarMenu>
          {nav.items.map((item: NavItem | undefined) => {
            const itemUrl = item?.url as string | undefined;
            const isRootDashboard = itemUrl === '/dashboard';
            const isActive = Boolean(
              item?.is_active ||
              (mounted &&
                itemUrl &&
                (isRootDashboard
                  ? pathname === itemUrl
                  : pathname === itemUrl || pathname.startsWith(`${itemUrl}/`)))
            );

            return (
              <Collapsible
                key={item?.title || item?.title || ''}
                asChild
                defaultOpen={item?.is_expand || false}
                className="group/collapsible"
              >
                <SidebarMenuItem>
                  {item?.children ? (
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip={item?.title}
                        isActive={isActive}
                        className={cn(
                          'h-10 rounded-xl px-3 py-2.5 text-sm transition-all',
                          'hover:bg-white/[0.04] hover:text-foreground',
                          // Active: crisp but not shouty; matches console layout.
                          'data-[active=true]:bg-white/5 data-[active=true]:text-foreground data-[active=true]:shadow-[0_0_0_1px_rgba(255,255,255,0.04)]'
                        )}
                      >
                        {item?.icon && <SmartIcon name={item.icon as string} />}
                        <span className="min-w-0 flex-1 truncate">
                          {item?.title || ''}
                        </span>
                        <ChevronRight className="ml-auto opacity-70 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                  ) : (
                    <SidebarMenuButton
                      asChild
                      tooltip={item?.title}
                      isActive={isActive}
                      className={cn(
                        'h-10 rounded-xl px-3 py-2.5 text-sm transition-all',
                        'hover:bg-white/[0.04] hover:text-foreground',
                        'data-[active=true]:bg-white/5 data-[active=true]:text-foreground data-[active=true]:shadow-[0_0_0_1px_rgba(255,255,255,0.04)]'
                      )}
                    >
                      <Link href={itemUrl as string} target={item?.target as string}>
                        {item?.icon && <SmartIcon name={item.icon as string} />}
                        <span className="min-w-0 flex-1 truncate">
                          {item?.title || ''}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  )}
                  {item?.children && (
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.children?.map((subItem: NavItem) => {
                          const subItemUrl = subItem.url as string | undefined;
                          const isSubItemActive = Boolean(
                            subItem.is_active ||
                            (mounted && subItemUrl && pathname.endsWith(subItemUrl))
                          );

                          return (
                            <SidebarMenuSubItem
                              key={subItem.title || subItem.title}
                            >
                              <SidebarMenuSubButton
                                asChild
                                className={cn(
                                  'rounded-lg px-2 py-2 text-xs transition-colors',
                                  'hover:bg-white/[0.04] hover:text-foreground',
                                  isSubItemActive
                                    ? 'bg-white/5 text-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.04)]'
                                    : 'text-muted-foreground'
                                )}
                              >
                                <Link
                                  href={subItemUrl as string}
                                  target={subItem.target as string}
                                >
                                  {/* {subItem.icon && (
                                    <SmartIcon name={subItem.icon as string} />
                                  )} */}
                                  <span className="px-2">{subItem.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  )}
                </SidebarMenuItem>
              </Collapsible>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
