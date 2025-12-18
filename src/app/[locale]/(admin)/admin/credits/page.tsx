import { getTranslations, setRequestLocale } from 'next-intl/server';

import { PERMISSIONS, requirePermission } from '@/core/rbac';
import { Header, Main } from '@/shared/blocks/dashboard';
import { TableCard } from '@/shared/blocks/table';
import {
  CreditStatus,
  CreditTransactionType,
  getCredits,
  getCreditsCount,
} from '@/shared/models/credit';
import { Crumb, Tab } from '@/shared/types/blocks/common';
import { type Table } from '@/shared/types/blocks/table';
import { CreditsGive } from './credits-give';
import { DeleteCreditButton } from '@/shared/blocks/admin/delete-credit-button';
import { CreditsTabs } from './credits-tabs';

export default async function CreditsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  await requirePermission({
    code: PERMISSIONS.CREDITS_READ,
    redirectUrl: '/admin/no-permission',
    locale,
  });

  const t = await getTranslations('admin.credits');

  const resolvedSearchParams = await searchParams;
  const page = Number(resolvedSearchParams.page) || 1;
  const limit = Number(resolvedSearchParams.pageSize) || 30;
  const type = typeof resolvedSearchParams.type === 'string' ? resolvedSearchParams.type : undefined;

  const crumbs: Crumb[] = [
    { title: t('list.crumbs.admin'), url: '/admin' },
    { title: t('list.crumbs.credits'), is_active: true },
  ];

  const tabs: Tab[] = [
    {
      name: 'all',
      title: t('list.tabs.all'),
      url: '/admin/credits',
      is_active: !type || type === 'all',
    },
    {
      name: 'grant',
      title: t('list.tabs.grant'),
      url: '/admin/credits?type=grant',
      is_active: type === 'grant',
    },
    {
      name: 'consume',
      title: t('list.tabs.consume'),
      url: '/admin/credits?type=consume',
      is_active: type === 'consume',
    },
  ];

  const total = await getCreditsCount({
    transactionType: type as CreditTransactionType,
    status: CreditStatus.ACTIVE,
  });

  const credits = await getCredits({
    transactionType: type as CreditTransactionType,
    status: CreditStatus.ACTIVE,
    getUser: true,
    page,
    limit,
  });

  const table: Table = {
    columns: [
      {
        name: 'transactionNo',
        title: t('fields.transaction_no'),
        type: 'copy',
      },
      { name: 'user', title: t('fields.user'), type: 'user' },
      {
        name: 'credits',
        title: t('fields.amount'),
        callback: (item) => {
          if (item.credits > 0) {
            return <div className="text-green-500">+{item.credits}</div>;
          } else {
            return <div className="text-red-500">{item.credits}</div>;
          }
        },
      },
      {
        name: 'remainingCredits',
        title: t('fields.remaining'),
        type: 'label',
        placeholder: '-',
      },
      { name: 'transactionType', title: t('fields.type') },
      { name: 'transactionScene', title: t('fields.scene'), placeholder: '-' },
      { name: 'description', title: t('fields.description'), placeholder: '-' },
      { name: 'createdAt', title: t('fields.created_at'), type: 'time' },
      {
        name: 'expiresAt',
        title: t('fields.expires_at'),
        type: 'time',
        placeholder: '-',
        metadata: { format: 'YYYY-MM-DD HH:mm:ss' },
      },
      {
        name: 'metadata',
        title: t('fields.metadata'),
        type: 'json_preview',
        placeholder: '-',
      },
      {
        name: 'actions',
        title: '操作',
        callback: (item) => <DeleteCreditButton id={item.id} />,
      },
    ],
    data: credits,
    pagination: {
      total,
      page,
      limit,
    },
  };

  return (
    <>
      <Header crumbs={crumbs} />
      <Main>
        <div className="mb-6 flex items-start justify-between">
          <div className="flex-1">
            <h2 className="text-2xl font-bold tracking-tight">{t('list.title')}</h2>
          </div>
          {/* 赠送按钮 */}
          <CreditsGive />
        </div>
        {/* tabs切换 */}
        {tabs && tabs.length > 0 && <CreditsTabs tabs={tabs} />}
        <TableCard key={type || 'all'} table={table} />
      </Main>
    </>
  );
}
