import moment from 'moment';
import { getLocale, getTranslations } from 'next-intl/server';

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
  const commonTranslationsPromise = getTranslations('common');
  const localePromise = getLocale();

  const user = await userPromise;
  if (!user) {
    return <Empty message="no auth" />;
  }

  const [t, tCommon, locale] = await Promise.all([
    translationsPromise,
    commonTranslationsPromise,
    localePromise,
  ]);
  const momentLocale = locale === 'zh' ? 'zh-cn' : locale;
  const dateFormat = locale === 'zh' ? 'YYYY年MM月DD日' : 'MMM D, YYYY';
  const now = new Date();

  const formatDate = (value?: string | Date | null) => {
    if (!value) return '-';
    return moment(value).locale(momentLocale).format(dateFormat);
  };

  const getPlanDisplayName = (item?: Pick<Subscription, 'planName' | 'productName' | 'productId'> | null) => {
    if (!item) return '-';

    const candidates = [item.planName, item.productName, item.productId].filter(
      (v): v is string => typeof v === 'string' && v.trim().length > 0
    );

    for (const raw of candidates) {
      const normalized = raw.trim().toLowerCase();
      if (normalized.includes('standard') || raw.includes('标准')) {
        return tCommon('plans.standard');
      }
      if (
        normalized.includes('pro') ||
        normalized.includes('premium') ||
        raw.includes('高级')
      ) {
        return tCommon('plans.pro');
      }
    }

    return item.planName || item.productName || '-';
  };

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

  const subscriptionsView = subscriptions.map((item) => ({
    ...item,
    statusLabel: item.status ? t(`list.tabs.${item.status}`) : '-',
  }));

  const currentSubscriptionStatusLabel = currentSubscription?.status
    ? t(`list.tabs.${currentSubscription.status}`)
    : undefined;

  const table: Table = {
    title: t('list.title'),
    columns: [
      {
        name: 'planName',
        title: t('fields.plan'),
        callback: function (item: Subscription) {
          const title = getPlanDisplayName(item);
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
        name: 'statusLabel',
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
          return <div>{t(`intervals.${item.interval}`, { count: item.intervalCount })}</div>;
        },
        className: 'hidden md:table-cell',
      },
      {
        name: 'createdAt',
        title: t('fields.created_at'),
        type: 'time',
        metadata: {
          format: {
            zh: 'YYYY年MM月DD日',
            en: 'MMM D, YYYY',
          },
        },
        className: 'hidden lg:table-cell',
      },
      {
        title: t('fields.current_period'),
        callback: function (item) {
          if (!item.currentPeriodStart || !item.currentPeriodEnd) {
            return '-';
          }

          return (
            <div>
              {formatDate(item.currentPeriodStart)} ~
              <br />
              {formatDate(item.currentPeriodEnd)}
            </div>
          );
        },
        className: 'hidden xl:table-cell',
      },
      {
        title: t('fields.end_time'),
        callback: function (item) {
          const endAt =
            item.canceledEndAt ||
            (item.status === SubscriptionStatus.PENDING_CANCEL
              ? item.currentPeriodEnd
              : null);

          if (endAt) {
            return (
              <div>{formatDate(endAt)}</div>
            );
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

          const actions: any[] = [];

          // Always allow going to the provider billing portal when available.
          // This is safer than exposing cancellation for stale records.
          if (item.paymentUserId) {
            actions.push({
              title: t('view.buttons.manage'),
              url: `/settings/billing/retrieve?subscription_no=${item.subscriptionNo}`,
              icon: 'Settings',
            });
          }

          // Only offer cancellation when the current billing period is still valid.
          if (item.currentPeriodEnd && item.currentPeriodEnd > now) {
            actions.push({
              title: t('view.buttons.cancel'),
              url: `/settings/billing/cancel?subscription_no=${item.subscriptionNo}`,
              icon: 'Ban',
            });
          }

          return actions.length > 0 ? actions : null;
        },
      },
    ],
    data: subscriptionsView,
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
          label={currentSubscriptionStatusLabel}
          title={t('view.title')}
          buttons={buttons}
          className="w-full"
        >
          <div className="text-primary text-3xl font-bold">
            {currentSubscription
              ? getPlanDisplayName(currentSubscription)
              : t('view.no_subscription')}
          </div>
          {currentSubscription ? (
            <>
              {currentSubscription?.status === SubscriptionStatus.ACTIVE ||
                currentSubscription?.status === SubscriptionStatus.TRIALING ? (
                <div className="text-muted-foreground mt-4 text-sm font-normal">
                  {t('view.tip', {
                    date: formatDate(currentSubscription?.currentPeriodEnd),
                  })}
                </div>
              ) : (
                <div className="text-destructive mt-4 text-sm font-normal">
                  {t('view.end_tip', {
                    date:
                      (currentSubscription?.canceledEndAt ||
                        currentSubscription?.currentPeriodEnd)
                        ? formatDate(
                            currentSubscription?.canceledEndAt ||
                              currentSubscription?.currentPeriodEnd
                          )
                      : '-',
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
