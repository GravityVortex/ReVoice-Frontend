import moment from 'moment';
import { getTranslations } from 'next-intl/server';

import { Link } from '@/core/i18n/navigation';
import { ConsolePageHeader } from '@/shared/blocks/console/page-header';
import {
  getCurrentSubscription,
  SubscriptionStatus,
} from '@/shared/models/subscription';
import { getRemainingCredits } from '@/shared/models/credit';
import { getOrders, OrderStatus } from '@/shared/models/order';
import { getUserInfo } from '@/shared/models/user';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';

function formatMoney(amountInCents: number | null | undefined, currency?: string) {
  const amount = typeof amountInCents === 'number' ? amountInCents / 100 : 0;
  const cur = (currency || 'USD').toUpperCase();

  if (cur === 'USD') return `$${amount}`;
  if (cur === 'EUR') return `€${amount}`;
  if (cur === 'CNY') return `¥${amount}`;
  return `${cur} ${amount}`;
}

export default async function SettingsOverviewPage() {
  const t = await getTranslations('settings.overview');

  const user = await getUserInfo();
  if (!user) {
    return (
      <div className="space-y-6">
        <ConsolePageHeader
          title={t('title')}
          description={t('description')}
          icon="LayoutDashboard"
        />

        <div className="mx-auto max-w-xl">
          <Card>
            <CardHeader>
              <CardTitle>{t('auth.title')}</CardTitle>
              <CardDescription>{t('auth.description')}</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-end">
              <Button asChild className="rounded-full">
                <Link href="/sign-in?callbackUrl=/settings">
                  {t('auth.button')}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const [currentSubscription, remainingCredits, recentOrders] =
    await Promise.all([
      getCurrentSubscription(user.id),
      getRemainingCredits(user.id),
      getOrders({ userId: user.id, status: OrderStatus.PAID, page: 1, limit: 3 }),
    ]);

  const nextRenewal =
    currentSubscription?.currentPeriodEnd &&
    (currentSubscription.status === SubscriptionStatus.ACTIVE ||
      currentSubscription.status === SubscriptionStatus.TRIALING)
      ? moment(currentSubscription.currentPeriodEnd).format('YYYY-MM-DD')
      : null;

  return (
    <div className="space-y-4">
      <ConsolePageHeader
        title={t('title')}
        description={t('description')}
        icon="LayoutDashboard"
      />

      <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>{t('cards.account.title')}</CardTitle>
              <CardDescription>{t('cards.account.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold">{user?.name || '—'}</div>
                  <div className="text-muted-foreground truncate text-sm">{user?.email || '—'}</div>
                </div>
                <Button asChild variant="outline" size="sm" className="rounded-full">
                  <Link href="/settings/profile">{t('actions.open')}</Link>
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="text-muted-foreground text-xs">{t('labels.current_plan')}</div>
                  <div className="mt-1 text-lg font-semibold">
                    {currentSubscription?.planName || t('labels.no_subscription')}
                  </div>
                  {nextRenewal ? (
                    <div className="text-muted-foreground mt-1 text-xs">
                      {t('labels.renews_on', { date: nextRenewal })}
                    </div>
                  ) : null}
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="text-muted-foreground text-xs">
                    {t('labels.remaining_credits')}
                  </div>
                  <div className="mt-1 text-3xl font-semibold tabular-nums">
                    {remainingCredits}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button asChild variant="outline" size="sm" className="rounded-full">
                  <Link href="/settings/credits">{t('actions.view')}</Link>
                </Button>
                {currentSubscription ? (
                  <Button asChild variant="outline" size="sm" className="rounded-full">
                    <Link href="/settings/billing">{t('actions.manage')}</Link>
                  </Button>
                ) : (
                  <Button asChild size="sm" className="rounded-full">
                    <Link href="/pricing">{t('actions.upgrade')}</Link>
                  </Button>
                )}
                <Button asChild size="sm" className="rounded-full">
                  <Link href="/pricing">{t('actions.buy_credits')}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="flex flex-col">
            <CardHeader>
              <CardTitle>{t('cards.recent_orders.title')}</CardTitle>
              <CardDescription>{t('cards.recent_orders.description')}</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
              {recentOrders.length > 0 ? (
                <div className="divide-white/10 divide-y rounded-lg border border-white/10">
                  {recentOrders.map((o) => (
                    <div
                      key={o.orderNo}
                      className="flex items-center justify-between gap-3 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {o.productName || o.orderNo}
                        </div>
                        <div className="text-muted-foreground text-xs">
                          {moment(o.createdAt).format('YYYY-MM-DD')}
                        </div>
                      </div>
                      <div className="shrink-0 text-sm font-semibold tabular-nums">
                        {formatMoney(
                          o.paymentAmount ?? o.amount,
                          o.paymentCurrency ?? o.currency
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground text-sm">{t('labels.no_orders')}</div>
              )}
            </CardContent>
            <CardContent className="pt-0">
              <div className="flex justify-end">
                <Button asChild variant="outline" size="sm" className="rounded-full">
                  <Link href="/settings/payments">{t('actions.view')}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column */}
        <Card className="flex h-full flex-col">
          <CardHeader>
            <CardTitle>{t('cards.quick_actions.title')}</CardTitle>
            <CardDescription>{t('cards.quick_actions.description')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            <div className="grid gap-2">
              <Button asChild variant="outline" size="sm" className="rounded-full justify-start">
                <Link href="/settings/billing">{t('cards.subscription.title')}</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="rounded-full justify-start">
                <Link href="/settings/payments">{t('cards.payments.title')}</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="rounded-full justify-start">
                <Link href="/settings/credits">{t('cards.credits.title')}</Link>
              </Button>
            </div>

            <div className="mt-auto flex flex-col gap-2">
              <Button asChild size="sm" className="rounded-full">
                <Link href="/pricing">{t('actions.upgrade')}</Link>
              </Button>
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link href="/docs">{t('actions.docs')}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
