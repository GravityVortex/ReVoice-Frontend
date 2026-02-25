'use client';

import { RetroGrid } from '@/shared/components/magicui/retro-grid';
import { cn } from '@/shared/lib/utils';

interface LoadingOverlayProps {
    className?: string;
    message?: string;
}

function WindowsBootDots({ className }: { className?: string }) {
    const dots = Array.from({ length: 8 }, (_, i) => i);
    return (
        <div
            aria-hidden
            className={cn("relative h-12 w-12 motion-reduce:opacity-60", className)}
        >
            {/* Windows-ish orbit: keep it simple, but make it feel less like a generic spinner. */}
            <div className="absolute inset-0 animate-[spin_1.2s_cubic-bezier(0.55,0,0.25,1)_infinite] motion-reduce:animate-none">
                {dots.map((i) => {
                    const opacity = 0.18 + (i / (dots.length - 1)) * 0.72;
                    return (
                        <span
                            key={i}
                            className="absolute left-1/2 top-1/2 h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_18px_rgba(167,139,250,0.45)]"
                            style={{
                                transform: `translate(-50%, -50%) rotate(${i * 45}deg) translateY(-18px)`,
                                opacity,
                            }}
                        />
                    );
                })}
            </div>
        </div>
    );
}

export function LoadingOverlay({ className, message }: LoadingOverlayProps) {
    return (
        <div
            role="status"
            aria-live="polite"
            aria-busy="true"
            className={cn('fixed inset-0 z-50 grid place-items-center overflow-hidden', className)}
        >
            {/* Match site style: cosmic glass + subtle grid glow (single overlay).
               Use a near-opaque base so underlying brand marks don't “ghost” through. */}
            <div aria-hidden className="absolute inset-0 bg-background" />
            <div aria-hidden className="absolute inset-0 overflow-hidden">
                <div className="absolute -top-56 left-1/2 h-[520px] w-[1200px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-primary/22 via-primary/6 to-transparent blur-[90px] opacity-65" />
                <div className="absolute -top-28 right-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-purple-400/12 via-purple-400/0 to-transparent blur-[70px] opacity-55" />
                <div className="absolute -bottom-56 right-[-18%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-sky-400/12 via-sky-400/0 to-transparent blur-[90px] opacity-55" />
                <RetroGrid
                    className="opacity-25 mix-blend-screen motion-reduce:opacity-0"
                    angle={70}
                    cellSize={84}
                    opacity={0.12}
                    lightLineColor="rgba(167, 139, 250, 0.18)"
                    darkLineColor="rgba(167, 139, 250, 0.18)"
                />
            </div>

            <div className="relative w-full px-6">
                <div className="mx-auto flex w-full max-w-sm flex-col items-center gap-5 rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center shadow-[0_20px_60px_rgba(0,0,0,0.35)] backdrop-blur">
                    {/* Windows-like dots, but themed with our primary glow. */}
                    <WindowsBootDots />

                    <div className="max-w-[34ch] text-sm font-medium tracking-tight text-foreground/85">
                        {message || 'Loading...'}
                    </div>
                </div>
            </div>
        </div>
    );
}
