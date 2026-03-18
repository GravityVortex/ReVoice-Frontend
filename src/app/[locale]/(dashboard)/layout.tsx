"use client";

import { useEffect } from "react";
import { DashboardSidebar } from "@/shared/blocks/dashboard/sidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/shared/components/ui/sidebar";
import { useAppContext } from "@/shared/contexts/app";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useSignInRedirect } from "@/shared/hooks/use-sign-in-redirect";

import { DashboardHeader } from "@/shared/blocks/dashboard/header";

function AuthRedirectScreen() {
    const redirectToSignIn = useSignInRedirect();

    useEffect(() => {
        redirectToSignIn();
    }, []);

    return (
        <div className="relative flex min-h-screen w-full items-center justify-center bg-background overflow-hidden">
            {/* Ambient gradients — same as authenticated dashboard */}
            <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute -top-56 left-1/2 h-[520px] w-[1200px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,var(--tw-gradient-stops))] from-white/4 via-white/1 to-transparent blur-[80px] opacity-60" />
                <div className="absolute -top-32 right-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops))] from-white/2 via-transparent to-transparent blur-[60px] opacity-40" />
            </div>

            <div className="relative flex flex-col items-center gap-6">
                <img
                    src="/logo.png"
                    alt="Logo"
                    className="h-14 w-auto object-contain opacity-90 drop-shadow-[0_0_24px_rgba(167,139,250,0.25)]"
                />
                {/* Minimal spinner */}
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/70" />
            </div>
        </div>
    );
}

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, isCheckSign, isAuthLoading } = useAppContext();

    if ((isCheckSign || isAuthLoading) && !user) {
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
                <div className="flex-1 p-4 sm:p-8 space-y-6">
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

    if (!user) {
        return <AuthRedirectScreen />;
    }

    return (
        <SidebarProvider
            className="relative h-svh"
            style={
                {
                    // Match the console/sidebar proportions across the app.
                    "--sidebar-width": "calc(var(--spacing) * 72)",
                } as React.CSSProperties
            }
        >
            {/* Ambient background (matches console-surface vibe) */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-hidden"
            >
                <div className="absolute -top-56 left-1/2 h-[520px] w-[1200px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,var(--tw-gradient-stops))] from-white/3 via-white/1 to-transparent blur-[80px] opacity-50" />
                <div className="absolute -top-32 right-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops))] from-white/2 via-transparent to-transparent blur-[60px] opacity-40" />
            </div>

            <DashboardSidebar />
            {/* SidebarProvider locks body scroll; make inset the scroll container. */}
            <SidebarInset className="bg-background/40 min-h-0 overflow-auto backdrop-blur-xl">
                <DashboardHeader />
                <div className="flex min-h-0 flex-1 flex-col">
                    {children}
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
}
