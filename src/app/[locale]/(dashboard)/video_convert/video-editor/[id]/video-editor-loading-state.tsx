'use client';

import { Loader2 } from 'lucide-react';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/lib/utils';
import { RetroGrid } from '@/shared/components/magicui/retro-grid';

export function VideoEditorLoadingState() {
  return (
    <div className="bg-background/40 relative m-1 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 shadow-xl backdrop-blur-xl sm:m-3">
      {/* Ambient backdrop to match page shell */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-48 left-1/2 h-[420px] w-[1200px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/[0.03] via-white/[0.01] to-transparent opacity-50 blur-[90px]" />
        <RetroGrid
          className="opacity-25 mix-blend-screen motion-reduce:opacity-0"
          angle={72}
          cellSize={78}
          opacity={0.22}
          lightLineColor="rgba(255, 255, 255, 0.04)"
          darkLineColor="rgba(255, 255, 255, 0.04)"
        />
      </div>

      {/* Header Skeleton */}
      <div className="flex h-[4.5rem] items-center justify-between border-b border-white/[0.06] bg-black/20 px-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-8 rounded-full bg-white/[0.05]" />
          <Skeleton className="h-5 w-40 bg-white/[0.05]" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-24 rounded-full bg-white/[0.05]" />
          <Skeleton className="h-8 w-32 rounded-full bg-primary/20" />
        </div>
      </div>

      {/* Body Layout */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <div className="flex min-h-0 flex-1 gap-3">
          {/* Left Subtitle Workstation Skeleton */}
          <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-background/20 shadow-inner">
             {/* Subtitle Tabs/Headers */}
             <div className="h-12 border-b border-white/5 flex items-center px-4 pt-2">
                 <Skeleton className="h-6 w-24 bg-white/[0.05]" />
             </div>
             {/* Subtitle List */}
             <div className="flex-1 p-4 space-y-3">
                 {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex gap-3 items-start">
                        <Skeleton className="w-10 h-8 rounded bg-white/[0.05]" />
                        <Skeleton className="flex-1 h-14 rounded bg-white/[0.05]" />
                    </div>
                 ))}
             </div>
          </div>
          
          {/* Right Video Preview Skeleton */}
          <div className="w-[320px] md:w-[480px] lg:w-[40%] flex-shrink-0 rounded-xl overflow-hidden border border-white/10 bg-black/95 relative flex items-center justify-center">
             <div className="absolute inset-0 bg-gradient-to-tr from-white/[0.02] to-transparent pointer-events-none" />
             <div className="flex flex-col items-center gap-4 text-white/50">
                 <div className="relative">
                    <Loader2 className="w-10 h-10 animate-spin text-primary/70" />
                    <div className="absolute inset-0 bg-primary/30 blur-2xl rounded-full" />
                 </div>
                 <div className="flex items-center gap-2 text-sm font-medium tracking-wide">
                     <span className="animate-pulse">Loading Studio...</span>
                 </div>
             </div>
             
             {/* Preview controls skeleton layout */}
             <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/40 backdrop-blur-md border border-white/10 px-4 py-2 rounded-full">
                  <Skeleton className="h-6 w-6 rounded-full bg-white/[0.1]" />
                  <Skeleton className="h-1 w-24 rounded-full bg-white/5" />
                  <Skeleton className="h-6 w-6 rounded-full bg-white/[0.1]" />
             </div>
          </div>
        </div>

        {/* Timeline Dock Skeleton */}
        <div className="h-[240px] rounded-xl border border-white/10 bg-black/40 backdrop-blur-md p-3 flex flex-col gap-3">
             <div className="flex items-center justify-between">
                 <div className="flex gap-2">
                     <Skeleton className="h-8 w-8 rounded bg-white/[0.05]" />
                     <Skeleton className="h-8 w-8 rounded bg-white/[0.05]" />
                 </div>
                 <Skeleton className="h-8 w-40 rounded-full bg-white/[0.05]" />
             </div>
             <div className="flex-1 rounded-lg bg-black/60 border border-white/5 relative overflow-hidden">
                 <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-white/10" />
                 <div className="absolute left-0 bottom-4 right-0 h-8 bg-white/[0.02] rounded" />
             </div>
        </div>
      </div>
    </div>
  );
}
