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
    <SidebarHeaderComponent className="mb-0 border-b border-white/10 px-3 py-3">
      <SidebarMenu>
        <SidebarMenuItem className="flex items-center justify-between">
          {(open || !header.show_trigger) && (
            <SidebarMenuButton
              asChild
              className="h-16 w-full rounded-xl p-1 hover:bg-white/[0.04]"
            >
              {header.brand && (
                <Link href={header.brand.url || ''} className="flex h-full w-full items-center justify-center">
                  {header.brand.logo && (
                    <Image
                      src={header.brand.logo.src}
                      alt={header.brand.logo.alt || ''}
                      width={120}
                      height={120}
                      className="max-w-[80%] h-full w-auto object-contain transition-transform duration-300 hover:scale-110"
                    />
                  )}
                  <span className="sr-only">{header.brand.title}</span>
                </Link>
              )}
            </SidebarMenuButton>
          )}
          <div className="flex-1"></div>
          {header.show_trigger && <SidebarTrigger />}
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeaderComponent>
  );
}
