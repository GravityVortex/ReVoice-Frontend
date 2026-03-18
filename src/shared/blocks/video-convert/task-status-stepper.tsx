'use client';

import { cn } from '@/shared/lib/utils';
import { estimateTaskPercent } from '@/shared/lib/task-progress';

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | (string & {});

export type TaskStatusStepperCopy = {
  pending: { label: string; hint: string };
  processing: { label: string; hint: string };
  completed: { label: string; hint: string };
  failed: { label: string; hint: string };
  cancelled?: { label: string; hint: string };
};

function getStage(status: TaskStatus) {
  if (status === 'processing') return 1;
  if (status === 'completed' || status === 'failed' || status === 'cancelled') return 2;
  return 0; // pending + unknown -> treat as queued
}

function getHint(status: TaskStatus, copy: TaskStatusStepperCopy) {
  if (status === 'processing') return copy.processing.hint;
  if (status === 'completed') return copy.completed.hint;
  if (status === 'cancelled') return copy.cancelled?.hint ?? copy.failed.hint;
  if (status === 'failed') return copy.failed.hint;
  return copy.pending.hint;
}

function getFinalLabel(status: TaskStatus, copy: TaskStatusStepperCopy) {
  if (status === 'failed') return copy.failed.label;
  if (status === 'cancelled') return copy.cancelled?.label ?? copy.failed.label;
  return copy.completed.label;
}

function getStatusLabel(status: TaskStatus, copy: TaskStatusStepperCopy) {
  if (status === 'processing') return copy.processing.label;
  if (status === 'completed') return copy.completed.label;
  if (status === 'cancelled') return copy.cancelled?.label ?? copy.failed.label;
  if (status === 'failed') return copy.failed.label;
  return copy.pending.label;
}

function StageDot({ state }: { state: 'idle' | 'active' | 'done' | 'failed' }) {
  return (
    <span className="relative inline-flex items-center justify-center">
      <span
        className={cn(
          'size-2.5 rounded-full border',
          state === 'idle' && 'border-white/15 bg-background/30',
          state === 'active' && 'border-primary/35 bg-primary/70',
          state === 'done' && 'border-primary/25 bg-primary/55',
          state === 'failed' && 'border-destructive/35 bg-destructive/70'
        )}
      />
      {state === 'active' ? (
        <span
          aria-hidden
          className={cn(
            'absolute inset-[-6px] rounded-full border',
            'border-primary/20',
            'animate-pulse motion-reduce:animate-none'
          )}
        />
      ) : null}
    </span>
  );
}

export function TaskStatusStepper({
  status,
  progress,
  currentStep,
  copy,
  className,
  showHint = false,
  hintVariant = 'card',
  showPercent = false,
  showStageLabels = false,
}: {
  status: TaskStatus | undefined | null;
  progress?: unknown;
  currentStep?: unknown;
  copy: TaskStatusStepperCopy;
  className?: string;
  showHint?: boolean;
  hintVariant?: 'card' | 'inline';
  showPercent?: boolean;
  showStageLabels?: boolean;
}) {
  const safeStatus = (status || 'pending') as TaskStatus;
  const stage = getStage(safeStatus);
  const isFailed = safeStatus === 'failed' || safeStatus === 'cancelled';
  const isRunning = safeStatus === 'pending' || safeStatus === 'processing';
  const percent = estimateTaskPercent({ status: safeStatus, progress, currentStep });
  const visualPercent = isRunning ? Math.max(3, percent) : percent;

  const fillCls = (() => {
    if (safeStatus === 'completed') return 'bg-emerald-500/65';
    if (safeStatus === 'failed' || safeStatus === 'cancelled') return 'bg-destructive/60';
    if (safeStatus === 'processing') return 'bg-primary/80';
    return 'bg-primary/55';
  })();

  const statusDotCls = (() => {
    if (safeStatus === 'completed') return 'text-emerald-500';
    if (safeStatus === 'failed' || safeStatus === 'cancelled') return 'text-destructive';
    if (safeStatus === 'processing') return 'text-primary';
    return 'text-amber-500';
  })();

  const pendingState: Parameters<typeof StageDot>[0]['state'] = stage > 0 ? 'done' : 'active';
  const processingState: Parameters<typeof StageDot>[0]['state'] =
    stage === 0 ? 'idle' : stage === 1 ? 'active' : 'done';
  const finalState: Parameters<typeof StageDot>[0]['state'] =
    stage < 2 ? 'idle' : isFailed ? 'failed' : 'done';

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={cn('relative inline-flex size-2.5 items-center justify-center', statusDotCls)}>
            <span className="size-2 rounded-full bg-current opacity-70" />
            {isRunning ? (
              <span
                aria-hidden
                className="absolute inset-[-6px] rounded-full border border-current/25 animate-ping motion-reduce:animate-none"
              />
            ) : null}
          </span>
          <span className="text-sm font-medium text-foreground/90">
            {getStatusLabel(safeStatus, copy)}
          </span>
        </div>

        {showPercent ? (
          <span className="font-mono text-base tabular-nums text-foreground/90">
            {percent}%
          </span>
        ) : null}
      </div>

      <div
        className="relative h-2 overflow-hidden rounded-full border border-white/10 bg-white/[0.04]"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`${Math.round(percent)}%`}
      >
        <div className="h-full" style={{ width: `${visualPercent}%` }}>
          <div className={cn('relative h-full w-full', fillCls)}>
            {isRunning ? (
              <div
                aria-hidden
                className={cn(
                  'absolute inset-0 opacity-45',
                  '[background:linear-gradient(90deg,transparent,oklch(1_0_0_/_0.55),transparent)]',
                  '[background-size:220%_100%]',
                  'animate-shimmer motion-reduce:animate-none'
                )}
              />
            ) : null}
          </div>
        </div>



        {/* A small "tracer" dot so users feel the job is moving. */}
        {isRunning ? (
          <div
            aria-hidden
            className="absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${Math.min(100, Math.max(0, visualPercent))}%` }}
          >
            <div className="size-2 rounded-full bg-white/70 shadow-[0_0_0_1px_rgba(255,255,255,0.16),0_0_22px_rgba(255,255,255,0.12)]" />
          </div>
        ) : null}
      </div>

      {showStageLabels ? (
        <div className="grid grid-cols-3 items-center text-[11px] font-medium text-muted-foreground/80">
          <span className="truncate">{copy.pending.label}</span>
          <span className="truncate text-center">{copy.processing.label}</span>
          <span className="truncate text-right">{getFinalLabel(safeStatus, copy)}</span>
        </div>
      ) : null}

      {showHint ? (
        hintVariant === 'inline' ? (
          <div className="text-sm leading-relaxed text-muted-foreground">
            {getHint(safeStatus, copy)}
          </div>
        ) : (
          <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-muted-foreground">
            {getHint(safeStatus, copy)}
          </div>
        )
      ) : null}
    </div>
  );
}
