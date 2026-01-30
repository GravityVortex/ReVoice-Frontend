import { Trash } from 'lucide-react';

import {
  TableBody,
  TableCell,
  Table as TableComponent,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { type Pagination } from '@/shared/types/blocks/common';
import { type TableColumn } from '@/shared/types/blocks/table';

import { Copy } from './copy';
import { Dropdown } from './dropdown';
import { Image } from './image';
import { JsonPreview } from './json-preview';
import { Label } from './label';
import { Time } from './time';
import { User } from './user';

export function Table({
  columns,
  data,
  emptyMessage,
  pagination,
}: {
  columns?: TableColumn[];
  data?: any[];
  emptyMessage?: string;
  pagination?: Pagination;
}) {
  if (!columns) {
    columns = [];
  }

  const actionColumn = columns.find((column) => column.type === 'dropdown');
  const dataColumns = columns.filter((column) => column.type !== 'dropdown');

  const renderCell = (column: TableColumn, item: any) => {
    const value = item[column.name as keyof typeof item];
    const content = column.callback ? column.callback(item) : value;

    if (column.type === 'image') {
      return (
        <Image
          placeholder={column.placeholder}
          value={value}
          metadata={column.metadata}
          className={column.className}
        />
      );
    }

    if (column.type === 'time') {
      return (
        <Time
          placeholder={column.placeholder}
          value={value}
          metadata={column.metadata}
          className={column.className}
        />
      );
    }

    if (column.type === 'label') {
      return (
        <Label
          placeholder={column.placeholder}
          value={value}
          metadata={column.metadata}
          className={column.className}
        />
      );
    }

    if (column.type === 'copy' && value) {
      return (
        <Copy
          placeholder={column.placeholder}
          value={value}
          metadata={column.metadata}
          className={column.className}
        >
          {content}
        </Copy>
      );
    }

    if (column.type === 'dropdown') {
      return (
        <Dropdown
          placeholder={column.placeholder}
          value={content}
          metadata={column.metadata}
          className={column.className}
        />
      );
    }

    if (column.type === 'user') {
      return (
        <User
          placeholder={column.placeholder}
          value={value}
          metadata={column.metadata}
          className={column.className}
        />
      );
    }

    if (column.type === 'json_preview') {
      return (
        <JsonPreview
          placeholder={column.placeholder}
          value={value}
          metadata={column.metadata}
          className={column.className}
        />
      );
    }

    if (content === undefined || content === null) {
      return column.placeholder;
    }
    if (typeof content === 'string' && content.trim() === '') {
      return column.placeholder;
    }
    return content;
  };

  const mobilePrimary = dataColumns[0];
  const mobileSecondary = dataColumns[1];
  const mobileDetails = dataColumns.slice(2, 6); // keep cards compact on small screens

  return (
    <div className="space-y-3">
      {/* Mobile: card list (no horizontal scrolling tables) */}
      <div className="md:hidden space-y-3">
        {data && data.length > 0 ? (
          data.map((item: any, idx: number) => (
            <div
              key={idx}
              className="border-white/10 bg-white/[0.02] rounded-2xl border p-4 shadow-sm backdrop-blur"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  {mobilePrimary ? (
                    <div className="text-foreground text-sm font-semibold leading-tight">
                      {renderCell(mobilePrimary, item)}
                    </div>
                  ) : null}
                  {mobileSecondary ? (
                    <div className="text-muted-foreground text-xs">
                      {renderCell(mobileSecondary, item)}
                    </div>
                  ) : null}
                </div>

                {actionColumn ? (
                  <div className="shrink-0">
                    {renderCell(actionColumn, item)}
                  </div>
                ) : null}
              </div>

              {mobileDetails.length > 0 ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {mobileDetails.map((column, cidx) => (
                    <div key={`${idx}-${column.name || cidx}`} className="min-w-0">
                      <div className="text-muted-foreground text-[11px] uppercase tracking-wider">
                        {column.title}
                      </div>
                      <div className="text-foreground mt-1 text-sm">
                        {renderCell(column, item)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="text-muted-foreground flex w-full items-center justify-center py-10">
            {emptyMessage ? <p>{emptyMessage}</p> : <Trash className="h-10 w-10" />}
          </div>
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block">
        <TableComponent className="w-full">
          <TableHeader>
            <TableRow className="rounded-md">
              {columns &&
                columns.map((item: TableColumn, idx: number) => {
                  return (
                    <TableHead key={idx} className={item.className}>
                      {item.title}
                    </TableHead>
                  );
                })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data && data.length > 0 ? (
              data.map((item: any, idx: number) => (
                <TableRow key={idx} className="h-14">
                  {columns &&
                    columns.map((column: TableColumn, iidx: number) => {
                      return (
                        <TableCell key={iidx} className={column.className}>
                          {renderCell(column, item)}
                        </TableCell>
                      );
                    })}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length}>
                  <div className="text-muted-foreground flex w-full items-center justify-center py-8">
                    {emptyMessage ? <p>{emptyMessage}</p> : <Trash className="h-10 w-10" />}
                  </div>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </TableComponent>
      </div>
    </div>
  );
}

export * from './table-card';
