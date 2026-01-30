import { ReactNode } from 'react';

import { SidebarInset, SidebarProvider } from '@/shared/components/ui/sidebar';
import { Sidebar as SidebarType } from '@/shared/types/blocks/dashboard';

import { Sidebar } from './sidebar';

export function DashboardLayout({
  children,
  sidebar,
}: {
  children: ReactNode;
  sidebar: SidebarType;
}) {
  return (
    <SidebarProvider
      style={
        {
          '--sidebar-width': 'calc(var(--spacing) * 72)',// 菜单宽度
          '--header-height': 'calc(var(--spacing) * 14)',
        } as React.CSSProperties
      }
    >
      {/* 左侧面板菜单 */}
      {sidebar && (
        <Sidebar variant={sidebar.variant || 'inset'} sidebar={sidebar} />
      )}
      {/* 右侧面板内容 */}
      {/* SidebarProvider locks the viewport (`h-svh` + `overflow-hidden`), so the inset must scroll. */}
      <SidebarInset className="min-h-0 overflow-auto">{children}</SidebarInset>
    </SidebarProvider>
  );
}
