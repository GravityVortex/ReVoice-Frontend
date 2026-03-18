import { CircleAlert } from 'lucide-react';

import { cn } from '@/shared/lib/utils';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';

interface ErrorStateProps {
  title?: string;
  description?: string;
  detail?: string;
  action?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export function ErrorState({
  title = '页面暂时无法加载',
  description = '可能是网络波动，请稍后再试',
  detail,
  action,
  compact = false,
  className,
}: ErrorStateProps) {
  return (
    <div
      className={cn(
        'flex w-full items-center justify-center p-6',
        !compact && 'min-h-[50vh]',
        compact && 'py-10',
        className,
      )}
    >
      <Card className="bg-card/60 border-white/10 w-full max-w-xl shadow-lg backdrop-blur">
        <CardHeader className="gap-3">
          <div className="flex flex-col items-center gap-3 text-center">
            <span
              aria-hidden
              className="relative flex size-10 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/6"
            >
              <CircleAlert className="size-5 text-amber-500/80" />
              <span className="absolute inset-0 animate-pulse rounded-xl bg-amber-500/4" />
            </span>
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-muted-foreground text-center text-sm">{description}</p>

          {action && (
            <div className="flex items-center justify-center gap-3">{action}</div>
          )}

          {detail && (
            <>
              <div className="border-white/6 border-t" />
              <p className="text-muted-foreground/60 text-center text-xs break-all">
                {detail}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

interface ErrorBlockProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorBlock({ message, onRetry, className }: ErrorBlockProps) {
  return (
    <div
      className={cn(
        'flex items-start gap-2 rounded-lg border border-amber-500/10 bg-amber-500/4 px-3 py-2',
        className,
      )}
    >
      <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-500/70" />
      <p className="text-muted-foreground min-w-0 flex-1 text-xs leading-relaxed">
        {message}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="ml-1.5 inline-flex cursor-pointer items-center text-amber-500/80 underline underline-offset-2 transition-colors hover:text-amber-400"
          >
            重试
          </button>
        )}
      </p>
    </div>
  );
}
