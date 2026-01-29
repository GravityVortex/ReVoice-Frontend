'use client';

import React, { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';

interface SlidingTabItem {
    id: string;
    label: string;
}

interface SlidingTabsProps {
    tabs: SlidingTabItem[];
    activeTab: string;
    onChange: (id: string, index: number) => void;
    className?: string;
}

export function SlidingTabs({ tabs, activeTab, onChange, className }: SlidingTabsProps) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [tabWidths, setTabWidths] = useState<number[]>([]);
    const [tabOffsets, setTabOffsets] = useState<number[]>([]);
    const tabsRef = useRef<(HTMLButtonElement | null)[]>([]);

    useEffect(() => {
        const index = tabs.findIndex((tab) => tab.id === activeTab);
        if (index !== -1) setActiveIndex(index);
    }, [activeTab, tabs]);

    useEffect(() => {
        const measureTabs = () => {
            const widths: number[] = [];
            const offsets: number[] = [];
            let currentOffset = 0;

            tabsRef.current.forEach((tab) => {
                if (tab) {
                    const width = tab.offsetWidth;
                    widths.push(width);
                    offsets.push(currentOffset);
                    currentOffset += width;
                }
            });

            setTabWidths(widths);
            setTabOffsets(offsets);
        };

        measureTabs();
        window.addEventListener('resize', measureTabs);
        return () => window.removeEventListener('resize', measureTabs);
    }, [tabs]);

    return (
        <div className={cn("relative flex p-1 bg-muted/30 rounded-full backdrop-blur-sm border border-white/10 w-fit", className)}>
            {/* Sliding Background */}
            {tabWidths.length > 0 && (
                <motion.div
                    className="absolute top-1 bottom-1 left-1 bg-background shadow-sm rounded-full z-0 border border-black/5 dark:border-white/5"
                    initial={false}
                    animate={{
                        width: tabWidths[activeIndex],
                        x: tabOffsets[activeIndex],
                    }}
                    transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 30,
                    }}
                />
            )}

            {/* Tabs */}
            {tabs.map((tab, index) => (
                <button
                    key={tab.id}
                    ref={(el) => { tabsRef.current[index] = el; }}
                    onClick={() => {
                        onChange(tab.id, index);
                    }}
                    className={cn(
                        "relative z-10 px-4 py-1.5 text-sm font-medium transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        activeTab === tab.id ? "text-foreground" : "text-muted-foreground hover:text-foreground/80"
                    )}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
}
