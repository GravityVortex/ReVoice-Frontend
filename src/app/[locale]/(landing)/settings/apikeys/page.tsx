import { getTranslations } from 'next-intl/server';

import { Link } from '@/core/i18n/navigation';
import { Empty } from '@/shared/blocks/common';
import { ConsolePageHeader } from '@/shared/blocks/console/page-header';
import { TableCard } from '@/shared/blocks/table';
import { Button } from '@/shared/components/ui/button';
import {
  Apikey,
  ApikeyStatus,
  getApikeys,
  getApikeysCount,
} from '@/shared/models/apikey';
import { getUserInfo } from '@/shared/models/user';
import { type Table } from '@/shared/types/blocks/table';

function maskKey(value: string) {
  if (!value) return '';
  const prefix = value.slice(0, 3);
  const last = value.slice(-4);
  const maskLen = Math.max(0, value.length - prefix.length - last.length);
  return `${prefix}${'*'.repeat(maskLen)}${last}`;
}

export default async function ApiKeysPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: number; pageSize?: number }>;
}) {
  const { page: pageNum, pageSize } = await searchParams;
  const page = pageNum || 1;
  const limit = pageSize || 20;

  const userPromise = getUserInfo();
  const translationsPromise = getTranslations('settings.apikeys');

  const user = await userPromise;
  if (!user) {
    return <Empty message="no auth" />;
  }

  const t = await translationsPromise;

  const [total, apikeys] = await Promise.all([
    getApikeysCount({
      userId: user.id,
      status: ApikeyStatus.ACTIVE,
    }),
    getApikeys({
      userId: user.id,
      status: ApikeyStatus.ACTIVE,
      page,
      limit,
    }),
  ]);

  const table: Table = {
    title: t('list.title'),
    columns: [
      {
        name: 'title',
        title: t('fields.title'),
      },
      {
        name: 'key',
        title: t('fields.key'),
        type: 'copy',
        callback: (item: Apikey) => (
          <span className="font-mono text-xs md:text-sm">
            {maskKey(item.key)}
          </span>
        ),
      },
      {
        name: 'createdAt',
        title: t('fields.created_at'),
        type: 'time',
      },
      {
        name: 'action',
        title: t('fields.action'),
        type: 'dropdown',
        callback: (item: Apikey) => {
          return [
            {
              title: t('list.buttons.edit'),
              url: `/settings/apikeys/${item.id}/edit`,
              icon: 'RiEditLine',
            },
            {
              title: t('list.buttons.delete'),
              url: `/settings/apikeys/${item.id}/delete`,
              icon: 'RiDeleteBinLine',
            },
          ];
        },
      },
    ],
    data: apikeys,
    emptyMessage: t('list.empty_message'),
    pagination: {
      total,
      page,
      limit,
    },
  };

  return (
    <div className="space-y-8">
      <ConsolePageHeader
        title={t('list.title')}
        icon="Key"
        actions={
          <Button asChild size="sm" className="rounded-full">
            <Link href="/settings/apikeys/create">{t('list.buttons.add')}</Link>
          </Button>
        }
      />
      <TableCard table={table} />
    </div>
  );
}
