'use client';

import { Coins, CreditCard, History } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Link } from '@/core/i18n/navigation';
import { Button } from '@/shared/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/shared/components/ui/popover';
import { useAppContext } from '@/shared/contexts/app';
import { cn } from '@/shared/lib/utils';

const LOW_BALANCE_THRESHOLD = 100;

export function CreditsBadge() {
  const t = useTranslations('common.sign');
  const { user } = useAppContext();

  if (!user) return null;

  const credits = user.credits?.remainingCredits ?? 0;
  const isLow = credits > 0 && credits < LOW_BALANCE_THRESHOLD;
  const isEmpty = credits === 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-sm transition-colors',
            'hover:bg-muted/50 cursor-pointer outline-none',
            isEmpty && 'text-destructive',
            isLow && 'text-amber-500',
            !isEmpty && !isLow && 'text-muted-foreground hover:text-foreground'
          )}
        >
          <Coins
            size={16}
            className={cn(
              isEmpty && 'text-destructive',
              isLow && 'text-amber-500',
              !isEmpty && !isLow && 'text-primary'
            )}
          />
          <span className="tabular-nums font-medium">{credits}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-56 p-0">
        <div className="p-4 space-y-3">
          {/* Balance display */}
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{t('remaining_credits')}</p>
            <p
              className={cn(
                'text-2xl font-bold tabular-nums',
                isEmpty && 'text-destructive',
                isLow && 'text-amber-500'
              )}
            >
              {credits}
            </p>
          </div>

          {/* Status hint */}
          {(isLow || isEmpty) && (
            <p
              className={cn(
                'text-xs font-medium',
                isEmpty ? 'text-destructive' : 'text-amber-500'
              )}
            >
              {isEmpty ? t('creditsEmpty') : t('creditsLow')}
            </p>
          )}

          {/* Buy credits button */}
          <Button
            size="sm"
            className="w-full gap-1.5"
            onClick={() => window.open('/pricing', '_blank')}
          >
            <CreditCard size={14} />
            {t('buyCredits')}
          </Button>
        </div>

        {/* View history link */}
        <div className="border-t px-4 py-2.5">
          <Link
            href="/settings/credits"
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <History size={12} />
            {t('viewHistory')}
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
