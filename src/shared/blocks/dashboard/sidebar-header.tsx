import Image from 'next/image';

import { Link } from '@/core/i18n/navigation';
import {
  SidebarHeader as SidebarHeaderComponent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@/shared/components/ui/sidebar';
import { SidebarHeader as SidebarHeaderType } from '@/shared/types/blocks/dashboard';

export function SidebarHeader({ header }: { header: SidebarHeaderType }) {
  const { open } = useSidebar();
  return (
    <SidebarHeaderComponent className="mb-0 border-b border-white/10 px-3 py-3 group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-2">
      <SidebarMenu>
        <SidebarMenuItem className="flex items-center gap-2">
          {(
            <SidebarMenuButton
              asChild
              className={
                open
                  ? "h-16 w-auto flex-1 rounded-xl p-1 hover:bg-white/[0.04] group-data-[collapsible=icon]:size-12! group-data-[collapsible=icon]:p-0!"
                  : "h-12 w-12 rounded-lg p-0 hover:bg-transparent group-data-[collapsible=icon]:size-12! group-data-[collapsible=icon]:p-0!"
              }
            >
              {header.brand && (
                <Link href={header.brand.url || ''} className="flex h-full w-full items-center justify-center">
                  {header.brand.logo && (
                    <span
                      className={
                        open
                          ? "flex h-full w-full items-center justify-center"
                          : "flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-white/[0.08] via-white/[0.03] to-transparent ring-1 ring-white/10 shadow-[0_10px_28px_rgba(0,0,0,0.35)]"
                      }
                    >
                      <Image
                        src={open ? header.brand.logo.src : '/big.png'}
                        alt={header.brand.logo.alt || ''}
                        width={open ? 120 : 28}
                        height={open ? 120 : 28}
                        className={open
                          ? "max-w-[80%] h-full w-auto object-contain transition-transform duration-300 hover:scale-110"
                          : "h-7 w-7 object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.18)]"
                        }
                      />
                    </span>
                  )}
                  <span className="sr-only">{header.brand.title}</span>
                </Link>
              )}
            </SidebarMenuButton>
          )}
          {header.show_trigger && open && <SidebarTrigger className="ml-auto" />}
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeaderComponent>
  );
}
