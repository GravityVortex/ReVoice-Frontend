import { Link } from '@/core/i18n/navigation';
import { Pagination } from '@/shared/blocks/common/pagination';
import { SmartIcon } from '@/shared/blocks/common/smart-icon';
import { Tabs } from '@/shared/blocks/common/tabs';
import { Table } from '@/shared/blocks/table';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { cn } from '@/shared/lib/utils';
import {
  Button as ButtonType,
  Tab as TabType,
} from '@/shared/types/blocks/common';
import { Table as TableType } from '@/shared/types/blocks/table';

export function TableCard({
  title,
  description,
  buttons,
  tabs,
  table,
  className,
}: {
  title?: string;
  description?: string;
  buttons?: ButtonType[];
  tabs?: TabType[];
  table: TableType;
  className?: string;
}) {
  return (
    <Card className={cn('gap-4 py-5', className)}>
      {(title || description || buttons) && (
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-2">
            {title && <CardTitle className="text-base">{title}</CardTitle>}
            {description && <CardDescription>{description}</CardDescription>}
          </div>
          {buttons && buttons.length > 0 && (
            <CardAction>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {buttons.map((button, idx) => (
                  <Button
                    key={idx}
                    asChild
                    variant={button.variant || 'default'}
                    size={button.size || 'sm'}
                    className="rounded-full"
                  >
                    <Link
                      href={button.url || ''}
                      target={button.target || '_self'}
                    >
                      {button.icon && <SmartIcon name={button.icon as string} />}
                      {button.title}
                    </Link>
                  </Button>
                ))}
              </div>
            </CardAction>
          )}
        </CardHeader>
      )}

      {table && (
        <CardContent className="space-y-4">
          {tabs && tabs.length > 0 ? <Tabs tabs={tabs} /> : null}
          <Table {...table} />
        </CardContent>
      )}

      {table.pagination && (
        <CardFooter className="border-white/10 border-t pt-4">
          <Pagination {...table.pagination} />
        </CardFooter>
      )}
    </Card>
  );
}
