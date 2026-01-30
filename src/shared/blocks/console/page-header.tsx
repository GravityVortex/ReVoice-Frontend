import { ReactNode } from 'react';

import { SmartIcon } from '@/shared/blocks/common/smart-icon';
import { cn } from '@/shared/lib/utils';

export function ConsolePageHeader({
  title,
  description,
  icon,
  actions,
  className,
}: {
  title: string;
  description?: string;
  icon?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between',
        className
      )}
    >
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          {icon ? (
            <span
              aria-hidden
              className="bg-white/[0.03] border-white/10 text-muted-foreground flex size-9 items-center justify-center rounded-xl border"
            >
              <SmartIcon name={icon} size={16} />
            </span>
          ) : null}
          <h1 className="text-foreground text-2xl font-semibold tracking-tight">
            {title}
          </h1>
        </div>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>

      {actions ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}

