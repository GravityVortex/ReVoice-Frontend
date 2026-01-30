import { getTranslations } from 'next-intl/server';

import { PaymentType } from '@/extensions/payment';
import { Empty } from '@/shared/blocks/common';
import { ConsolePageHeader } from '@/shared/blocks/console/page-header';
import { TableCard } from '@/shared/blocks/table';
import {
  getOrders,
  getOrdersCount,
  Order,
  OrderStatus,
} from '@/shared/models/order';
import { getUserInfo } from '@/shared/models/user';
import { Tab } from '@/shared/types/blocks/common';
import { type Table } from '@/shared/types/blocks/table';

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: number; pageSize?: number; type?: string }>;
}) {
  const { page: pageNum, pageSize, type } = await searchParams;
  const page = pageNum || 1;
  const limit = pageSize || 8;

  const userPromise = getUserInfo();
  const translationsPromise = getTranslations('settings.payments');

  const user = await userPromise;
  if (!user) {
    return <Empty message="no auth" />;
  }

  const t = await translationsPromise;

  const [total, orders] = await Promise.all([
    getOrdersCount({
      paymentType: type as PaymentType,
      userId: user.id,
      status: OrderStatus.PAID,
    }),
    getOrders({
      paymentType: type as PaymentType,
      userId: user.id,
      status: OrderStatus.PAID,
      page,
      limit,
    }),
  ]);

  const table: Table = {
    title: t('list.title'),
    columns: [
      {
        name: 'productName',
        title: t('fields.product_name'),
        callback: (item: Order) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{item.productName || '-'}</div>
            <div className="text-muted-foreground truncate text-xs">
              {item.orderNo}
            </div>
          </div>
        ),
      },
      {
        name: 'paymentType',
        title: t('fields.type'),
        type: 'label',
        metadata: { variant: 'outline' },
        className: 'hidden lg:table-cell',
      },
      {
        title: t('fields.paid_amount'),
        callback: function (item) {
          const currency = (item.paymentCurrency || item.currency || 'USD').toUpperCase();

          let prefix = '';
          if (currency === 'USD') {
            prefix = `$`;
          } else if (currency === 'EUR') {
            prefix = `€`;
          } else if (currency === 'CNY') {
            prefix = `¥`;
          } else {
            prefix = `${currency} `;
          }

          const amount = (item.paymentAmount ?? item.amount ?? 0) / 100;
          return <div className="text-primary font-semibold tabular-nums">{`${prefix}${amount}`}</div>;
        },
      },
      {
        name: 'createdAt',
        title: t('fields.created_at'),
        type: 'time',
      },
      {
        name: 'actions',
        title: t('fields.action'),
        type: 'dropdown',
        callback: (item: Order) => {
          if (item.invoiceUrl) {
            return [
              {
                title: t('fields.actions.view_invoice'),
                url: item.invoiceUrl,
                target: '_blank',
                icon: 'ArrowUpRight',
              },
            ];
          } else if (item.invoiceId) {
            return [
              {
                title: t('fields.actions.view_invoice'),
                url: `/settings/invoices/retrieve?order_no=${item.orderNo}`,
                icon: 'ArrowUpRight',
              },
            ];
          }
        },
      },
    ],
    data: orders,
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
      url: '/settings/payments',
      is_active: !type || type === 'all',
    },
    {
      title: t('list.tabs.one-time'),
      name: 'one-time',
      url: '/settings/payments?type=one-time',
      is_active: type === 'one-time',
    },
    {
      title: t('list.tabs.subscription'),
      name: 'subscription',
      url: '/settings/payments?type=subscription',
      is_active: type === 'subscription',
    },
    {
      title: t('list.tabs.renew'),
      name: 'renew',
      url: '/settings/payments?type=renew',
      is_active: type === 'renew',
    },
  ];

  return (
    <div className="space-y-6">
      <ConsolePageHeader
        title={t('list.title')}
        description={t('list.description')}
        icon="DollarSign"
      />

      <TableCard
        tabs={tabs}
        table={table}
      />
    </div>
  );
}
