"use client";

import React from 'react';
import { Loader2, AlertTriangle, WifiOff, MicOff } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/lib/utils';

export type PlaybackGateStatus = 'loading' | 'retrying' | 'network_failed' | 'voice_unavailable';

export type PlaybackGateAction = {
  label: string;
  onClick?: () => void;
  tone?: 'primary' | 'secondary' | 'ghost';
};

export type PlaybackGateCardProps = {
  state?: PlaybackGateStatus;
  status?: PlaybackGateStatus;
  title: string;
  description?: string;
  message?: string;
  detail?: string;
  hint?: string;
  icon?: React.ReactNode;
  actions?: PlaybackGateAction[];
  primaryAction?: PlaybackGateAction;
  secondaryAction?: PlaybackGateAction;
  tertiaryAction?: PlaybackGateAction;
};

const STATUS_ICONS: Record<PlaybackGateStatus, React.ElementType> = {
  loading: Loader2,
  retrying: Loader2,
  network_failed: WifiOff,
  voice_unavailable: MicOff,
};

const STATUS_COLORS: Record<PlaybackGateStatus, string> = {
  loading: 'text-white/80',
  retrying: 'text-white/80',
  network_failed: 'text-rose-400',
  voice_unavailable: 'text-white/80',
};

export function PlaybackGateCard({
  state,
  status,
  title,
  description,
  message,
  detail,
  hint,
  actions = [],
  primaryAction,
  secondaryAction,
  tertiaryAction,
}: PlaybackGateCardProps) {
  const resolvedStatus = state ?? status ?? 'loading';
  const resolvedMessage = description ?? message ?? '';
  const resolvedHint = detail ?? hint;
  const limitedActions = (actions.length > 0
    ? actions
    : [primaryAction, secondaryAction, tertiaryAction].filter(Boolean)) as PlaybackGateAction[];
  const visibleActions = limitedActions.slice(0, 3);
  
  const Icon = STATUS_ICONS[resolvedStatus] || AlertTriangle;
  const isSpinning = resolvedStatus === 'loading' || resolvedStatus === 'retrying';

  return (
    <div
      data-gate-state={resolvedStatus}
      data-slot="playback-gate-card"
      className="flex items-center gap-3 overflow-hidden rounded-xl border border-white/10 bg-black/80 px-4 py-3 text-left text-white backdrop-blur-md shadow-xl"
    >
      <Icon className={cn('h-5 w-5 shrink-0', STATUS_COLORS[resolvedStatus], isSpinning && 'animate-spin')} />

      <div className="flex flex-col flex-1 min-w-[120px] mr-2 justify-center">
        <h3 className="text-[13px] font-medium leading-tight text-white/95">{title}</h3>
        {resolvedMessage && (
          <p className="mt-0.5 text-[11px] text-white/60 line-clamp-1">{resolvedMessage}</p>
        )}
      </div>

      {visibleActions.length > 0 && (
        <div data-slot="playback-gate-actions" className="flex shrink-0 items-center gap-2 border-l border-white/10 pl-3 ml-1">
          {visibleActions.map((action) => (
            <Button
              key={action.label}
              variant="outline"
              size="sm"
              onClick={action.onClick}
              className="h-7 px-3 text-[11px] font-medium rounded-lg bg-transparent border-white/20 text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            >
              {action.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
