"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/core/i18n/navigation";
import {
    Video,
    Mic2,
    Languages,
    ArrowRight,
} from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from "@/shared/components/ui/skeleton";
import { useAppContext } from "@/shared/contexts/app";

export default function DashboardPage() {
    const { user, isCheckSign } = useAppContext();
    const t = useTranslations('common.dashboard.home');

    const cards = [
        {
            titleKey: 'cards.translation.title',
            descriptionKey: 'cards.translation.description',
            icon: Languages,
            href: "/dashboard/create",
            color: "text-blue-500",
            bgColor: "bg-blue-500/10",
            gradient: "from-blue-500/20 to-purple-500/20",
            active: true
        },
        {
            titleKey: 'cards.lipsync.title',
            descriptionKey: 'cards.lipsync.description',
            icon: Video,
            href: "#",
            color: "text-purple-500",
            bgColor: "bg-purple-500/10",
            gradient: "from-purple-500/20 to-pink-500/20",
            active: false,
            tagKey: 'buttons.comingSoon'
        },
        {
            titleKey: 'cards.voice.title',
            descriptionKey: 'cards.voice.description',
            icon: Mic2,
            href: "#",
            color: "text-orange-500",
            bgColor: "bg-orange-500/10",
            gradient: "from-orange-500/20 to-red-500/20",
            active: false,
            tagKey: 'buttons.comingSoon'
        }
    ];

    // Show skeleton during initial load
    if (isCheckSign) {
        return (
            <div className="max-w-6xl mx-auto space-y-12 py-10">
                <div className="space-y-2">
                    <Skeleton className="h-10 w-64" />
                    <Skeleton className="h-6 w-96" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3].map((i) => (
                        <Skeleton key={i} className="h-64 rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto space-y-12 py-10">

            {/* Header Section */}
            <div className="space-y-2">
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                    {t('greeting', { name: user?.name || '' })}
                </h1>
                <p className="text-muted-foreground text-lg">
                    {t('subtitle')}
                </p>
            </div>

            {/* Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {cards.map((card, idx) => (
                    <div
                        key={idx}
                        className={`group relative overflow-hidden rounded-xl border bg-card p-6 transition-all hover:shadow-lg ${card.active ? 'hover:border-primary/50 cursor-pointer' : 'opacity-80 cursor-default'}`}
                    >
                        {/* Background Gradient Effect */}
                        <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 transition-opacity group-hover:opacity-100`} />

                        <div className="relative z-10 flex flex-col h-full">
                            <div className="flex justify-between items-start mb-4">
                                <div className={`p-3 rounded-lg ${card.bgColor} ${card.color}`}>
                                    <card.icon className="w-8 h-8" />
                                </div>
                                {card.tagKey && (
                                    <span className="px-2 py-1 text-xs font-medium bg-muted rounded-full">
                                        {t(card.tagKey)}
                                    </span>
                                )}
                            </div>

                            <h3 className="text-xl font-bold mb-2">{t(card.titleKey)}</h3>
                            <p className="text-muted-foreground mb-6 flex-1">
                                {t(card.descriptionKey)}
                            </p>

                            {card.active ? (
                                <Link href={card.href}>
                                    <Button className="w-full group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                                        {t('buttons.create')}
                                        <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </Link>
                            ) : (
                                <Button disabled variant="outline" className="w-full">
                                    {t('buttons.comingSoon')}
                                </Button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
