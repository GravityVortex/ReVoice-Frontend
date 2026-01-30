"use client";

import { DashboardSidebar } from "@/shared/blocks/dashboard/sidebar";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/shared/components/ui/sidebar";
import { useAppContext } from "@/shared/contexts/app";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { Button } from "@/shared/components/ui/button";
import { useSignInRedirect } from "@/shared/hooks/use-sign-in-redirect";
import { useTranslations } from "next-intl";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const { user, isCheckSign, isAuthLoading } = useAppContext();
    const t = useTranslations("common.sign");
    const redirectToSignIn = useSignInRedirect();

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

    if (!user) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-background p-6">
                <div className="w-full max-w-md rounded-xl border bg-card p-8 text-center shadow-sm">
                    <h1 className="text-xl font-semibold text-foreground">
                        {t("sign_in_description")}
                    </h1>
                    <p className="mt-2 text-sm text-muted-foreground">
                        {t("guest_sign_in_description")}
                    </p>
                    <div className="mt-6 flex justify-center">
                        <Button onClick={() => redirectToSignIn()}>
                            {t("sign_in_title")}
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <SidebarProvider
            className="relative"
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
                <div className="absolute -top-56 left-1/2 h-[520px] w-[1200px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/20 via-primary/5 to-transparent blur-[80px] opacity-60" />
                <div className="absolute -top-32 right-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-purple-400/10 via-purple-400/0 to-transparent blur-[60px] opacity-60" />
            </div>

            <DashboardSidebar />
            {/* SidebarProvider locks body scroll; make inset the scroll container. */}
            <SidebarInset className="bg-background/40 min-h-0 overflow-auto backdrop-blur-xl">
                {/* Mobile sidebar trigger */}
                <header className="bg-background/40 sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b border-white/10 px-4 backdrop-blur-xl md:hidden">
                    <SidebarTrigger />
                </header>
                <div className="flex min-h-0 flex-1 flex-col gap-4 p-8 pt-6">
                    {children}
                </div>
            </SidebarInset>
        </SidebarProvider>
    );
}
