import { getTranslations } from 'next-intl/server';

import { Link } from '@/core/i18n/navigation';
import { Empty } from '@/shared/blocks/common';
import { ConsolePageHeader } from '@/shared/blocks/console/page-header';
import { PanelCard } from '@/shared/blocks/panel';
import { TableCard } from '@/shared/blocks/table';
import { Button } from '@/shared/components/ui/button';
import {
  Credit,
  CreditStatus,
  CreditTransactionType,
  getCredits,
  getCreditsCount,
  getRemainingCredits,
} from '@/shared/models/credit';
import { getUserInfo } from '@/shared/models/user';
import { Tab } from '@/shared/types/blocks/common';
import { type Table } from '@/shared/types/blocks/table';

export default async function CreditsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: number; pageSize?: number; type?: string; stu?: string }>;
}) {
  const { page: pageNum, pageSize, type, stu } = await searchParams;
  const page = pageNum || 1;
  const limit = pageSize || 8;

  const userPromise = getUserInfo();
  const translationsPromise = getTranslations('settings.credits');

  const user = await userPromise;
  if (!user) {
    return <Empty message="no auth" />;
  }

  const t = await translationsPromise;

  const statusFilter = (stu as CreditStatus) || CreditStatus.ACTIVE;
  const transactionType = type as CreditTransactionType;

  const [total, credits, remainingCredits] = await Promise.all([
    getCreditsCount({
      transactionType,
      userId: user.id,
      status: statusFilter,
    }),
    getCredits({
      userId: user.id,
      status: statusFilter,
      transactionType,
      page,
      limit,
    }),
    getRemainingCredits(user.id),
  ]);

  const table: Table = {
    title: t('list.title'),
    columns: [
      {
        name: 'description',
        title: t('fields.description'),
        callback: (item: Credit) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{item.description || '-'}</div>
            <div className="text-muted-foreground truncate text-xs">
              {item.transactionNo}
            </div>
          </div>
        ),
      },
      {
        name: 'credits',
        title: t('fields.credits'),
        callback: (item) => {
          if (item.credits > 0) {
            return <div className="text-green-500">
              +{item.credits}
              {`/${item.remainingCredits}`}
            </div>;
          } else {
            return <div className="text-red-500">
              {item.credits}
              {item.status === 'deleted' ? <span className='text-green-500'>(已退)</span> : ''}
            </div>;
          }
        },
      },
      {
        name: 'expiresAt',
        title: t('fields.expires_at'),
        type: 'time',
        placeholder: '-',
        metadata: { format: 'YYYY-MM-DD HH:mm:ss' },
        className: 'hidden lg:table-cell',
      },
      {
        name: 'createdAt',
        title: t('fields.created_at'),
        type: 'time',
      },
    ],
    data: credits,
    pagination: {
      total,
      page,
      limit,
    },
  };

  const tabs: Tab[] = [
    {
      title: t('list.tabs.all'),
      name: 'all',
      url: '/settings/credits',
      is_active: !type || type === 'all',
    },
    {
      title: t('list.tabs.grant'),
      name: 'grant',
      url: '/settings/credits?type=grant',
      is_active: type === 'grant',
    },
    {
      title: t('list.tabs.consume'),
      name: 'consume',
      url: '/settings/credits?type=consume',
      is_active: type === 'consume',
    },
    {
      title: t('list.tabs.deleted'),
      name: 'deleted',
      url: '/settings/credits?type=consume&stu=deleted',
      is_active: type === 'deleted',
    },
  ];

  return (
    <div className="space-y-6">
      <ConsolePageHeader
        title={t('page.title')}
        description={t('page.description')}
        icon="Coins"
        actions={
          <Button
            asChild
            size="sm"
            className="rounded-full"
          >
            <Link href="/pricing" target="_blank" rel="noreferrer">
              {t('view.buttons.purchase')}
            </Link>
          </Button>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <TableCard className="order-2 lg:order-1" tabs={tabs} table={table} />

        <PanelCard
          title={t('view.title')}
          className="order-1 h-fit lg:order-2"
        >
          <div className="text-primary text-3xl font-bold">
            {remainingCredits}
          </div>
        </PanelCard>
      </div>
    </div>
  );
}
