"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardSidebar } from "@/shared/blocks/dashboard/sidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/shared/components/ui/sidebar";
import { useAppContext } from "@/shared/contexts/app";
import { Skeleton } from "@/shared/components/ui/skeleton";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, isCheckSign } = useAppContext();
    const router = useRouter();

    useEffect(() => {
        if (!isCheckSign && !user) {
            router.push('/sign-in');
        }
    }, [user, isCheckSign, router]);

    if (isCheckSign || !user) {
        return (
            <div className="flex w-full h-screen bg-background">
                {/* Sidebar Skeleton */}
                <div className="hidden md:flex w-64 flex-col border-r space-y-4 p-4">
                    <Skeleton className="h-8 w-3/4" />
                    <div className="space-y-2 mt-8">
                        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                </div>
                {/* Main Content Skeleton */}
                <div className="flex-1 p-8 space-y-6">
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-10 w-48" />
                        <Skeleton className="h-10 w-10 rounded-full" />
                    </div>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <SidebarProvider>
            <DashboardSidebar />
            <SidebarInset className="bg-background">
                {/* Mobile sidebar trigger */}
                <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 md:hidden">
                    <SidebarTrigger />
                </header>
                <div className="flex min-h-0 flex-1 flex-col gap-4 p-8 pt-6">
                    {children}
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
}
