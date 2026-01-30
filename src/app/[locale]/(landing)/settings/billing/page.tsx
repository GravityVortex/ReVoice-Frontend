import moment from 'moment';
import { getTranslations } from 'next-intl/server';

import { Empty } from '@/shared/blocks/common';
import { ConsolePageHeader } from '@/shared/blocks/console/page-header';
import { PanelCard } from '@/shared/blocks/panel';
import { TableCard } from '@/shared/blocks/table';
import {
  getCurrentSubscription,
  getSubscriptions,
  getSubscriptionsCount,
  Subscription,
  SubscriptionStatus,
} from '@/shared/models/subscription';
import { getUserInfo } from '@/shared/models/user';
import { Button as ButtonType, Tab } from '@/shared/types/blocks/common';
import { type Table } from '@/shared/types/blocks/table';

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: number; pageSize?: number; status?: string }>;
}) {
  const { page: pageNum, pageSize, status } = await searchParams;
  const page = pageNum || 1;
  const limit = pageSize || 8;

  const userPromise = getUserInfo();
  const translationsPromise = getTranslations('settings.billing');

  const user = await userPromise;
  if (!user) {
    return <Empty message="no auth" />;
  }

  const t = await translationsPromise;

  const [currentSubscription, total, subscriptions] = await Promise.all([
    getCurrentSubscription(user.id),
    getSubscriptionsCount({
      userId: user.id,
      status,
    }),
    getSubscriptions({
      userId: user.id,
      status,
      page,
      limit,
    }),
  ]);

  const table: Table = {
    title: t('list.title'),
    columns: [
      {
        name: 'planName',
        title: t('fields.plan'),
        callback: function (item: Subscription) {
          const title = item.planName || item.productName || '-';
          return (
            <div className="min-w-0">
              <div className="truncate font-medium">{title}</div>
              <div className="text-muted-foreground truncate text-xs">
                {item.subscriptionNo}
              </div>
            </div>
          );
        },
      },
      {
        name: 'status',
        title: t('fields.status'),
        type: 'label',
        metadata: { variant: 'outline' },
        className: 'hidden sm:table-cell',
      },
      {
        name: 'amount',
        title: t('fields.amount'),
        callback: function (item: Subscription) {
          const currency = (item.currency || 'USD').toUpperCase();

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

          return (
            <div className="text-primary font-semibold tabular-nums">{`${prefix}${(item.amount || 0) / 100}`}</div>
          );
        },
        className: 'hidden sm:table-cell',
      },
      {
        name: 'interval',
        title: t('fields.interval'),
        callback: function (item: Subscription) {
          if (!item.interval || !item.intervalCount) {
            return '-';
          }
          return <div>{`${item.intervalCount}-${item.interval}`}</div>;
        },
        className: 'hidden md:table-cell',
      },
      {
        name: 'createdAt',
        title: t('fields.created_at'),
        type: 'time',
        className: 'hidden lg:table-cell',
      },
      {
        title: t('fields.current_period'),
        callback: function (item) {
          let period = (
            <div>
              {`${moment(item.currentPeriodStart).format('YYYY-MM-DD')}`} ~
              <br />
              {`${moment(item.currentPeriodEnd).format('YYYY-MM-DD')}`}
            </div>
          );

          return period;
        },
        className: 'hidden xl:table-cell',
      },
      {
        title: t('fields.end_time'),
        callback: function (item) {
          if (item.canceledEndAt) {
            return <div>{moment(item.canceledEndAt).format('YYYY-MM-DD')}</div>;
          }
          return '-';
        },
        className: 'hidden xl:table-cell',
      },
      {
        title: t('fields.action'),
        type: 'dropdown',
        callback: function (item) {
          if (
            item.status !== SubscriptionStatus.ACTIVE &&
            item.status !== SubscriptionStatus.TRIALING
          ) {
            return null;
          }

          return [
            {
              title: t('view.buttons.cancel'),
              url: `/settings/billing/cancel?subscription_no=${item.subscriptionNo}`,
              icon: 'Ban',
              size: 'sm',
              variant: 'outline',
            },
          ];
        },
      },
    ],
    data: subscriptions,
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
      url: '/settings/billing',
      is_active: !status || status === 'all',
    },
    {
      title: t('list.tabs.active'),
      name: 'active',
      url: '/settings/billing?status=active',
      is_active: status === 'active',
    },
    {
      title: t('list.tabs.trialing'),
      name: 'trialing',
      url: '/settings/billing?status=trialing',
      is_active: status === 'trialing',
    },
    {
      title: t('list.tabs.paused'),
      name: 'paused',
      url: '/settings/billing?status=paused',
      is_active: status === 'paused',
    },
    {
      title: t('list.tabs.expired'),
      name: 'expired',
      url: '/settings/billing?status=expired',
      is_active: status === 'expired',
    },
    {
      title: t('list.tabs.pending_cancel'),
      name: 'pending_cancel',
      url: '/settings/billing?status=pending_cancel',
      is_active: status === 'pending_cancel',
    },
    {
      title: t('list.tabs.canceled'),
      name: 'canceled',
      url: '/settings/billing?status=canceled',
      is_active: status === 'canceled',
    },
  ];

  let buttons: ButtonType[] = [];
  if (currentSubscription) {
    buttons = [
      {
        title: t('view.buttons.adjust'),
        url: '/pricing',
        target: '_blank',
        icon: 'Pencil',
        size: 'sm',
      },
    ];
    if (currentSubscription.paymentUserId) {
      buttons.push({
        title: t('view.buttons.manage'),
        url: `/settings/billing/retrieve?subscription_no=${currentSubscription.subscriptionNo}`,
        target: '_blank',
        icon: 'Settings',
        size: 'sm',
        variant: 'outline',
      });
    }
  } else {
    buttons = [
      {
        title: t('view.buttons.subscribe'),
        url: '/pricing',
        target: '_blank',
        icon: 'ArrowUpRight',
        size: 'sm',
      },
    ];
  }

  return (
    <div className="space-y-6">
      <ConsolePageHeader
        title={t('page.title')}
        description={t('page.description')}
        icon="CreditCard"
      />

      <div className="flex flex-col gap-6">
        <PanelCard
          label={currentSubscription?.status}
          title={t('view.title')}
          buttons={buttons}
          className="w-full"
        >
          <div className="text-primary text-3xl font-bold">
            {currentSubscription?.planName || t('view.no_subscription')}
          </div>
          {currentSubscription ? (
            <>
              {currentSubscription?.status === SubscriptionStatus.ACTIVE ||
                currentSubscription?.status === SubscriptionStatus.TRIALING ? (
                <div className="text-muted-foreground mt-4 text-sm font-normal">
                  {t('view.tip', {
                    date: moment(currentSubscription?.currentPeriodEnd).format(
                      'YYYY-MM-DD'
                    ),
                  })}
                </div>
              ) : (
                <div className="text-destructive mt-4 text-sm font-normal">
                  {t('view.end_tip', {
                    date: moment(currentSubscription?.canceledEndAt).format(
                      'YYYY-MM-DD'
                    ),
                  })}
                </div>
              )}
            </>
          ) : null}
        </PanelCard>

        <TableCard className="w-full" tabs={tabs} table={table} />
      </div>
    </div>
  );
}
