import moment from 'moment';
import { getTranslations } from 'next-intl/server';
import {
  CreditCard,
  FileText,
  Key,
  LayoutDashboard,
  Lock,
  User,
  Zap,
  ChevronRight,
  Settings,
  CreditCard as BillingIcon
} from 'lucide-react';

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
import { cn } from '@/shared/lib/utils';
import { SmartIcon } from '@/shared/blocks/common';
import { Avatar, AvatarFallback, AvatarImage } from '@/shared/components/ui/avatar';

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

        <div className="mx-auto max-w-xl text-center py-20">
          <Card>
            <CardHeader>
              <CardTitle>{t('auth.title')}</CardTitle>
              <CardDescription>{t('auth.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="rounded-full px-8" size="lg">
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
      getOrders({ userId: user.id, status: OrderStatus.PAID, page: 1, limit: 5 }),
    ]);

  const nextRenewal =
    currentSubscription?.currentPeriodEnd &&
      (currentSubscription.status === SubscriptionStatus.ACTIVE ||
        currentSubscription.status === SubscriptionStatus.TRIALING)
      ? moment(currentSubscription.currentPeriodEnd).format('YYYY-MM-DD')
      : null;

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-10">
      <ConsolePageHeader
        title={t('title')}
        description={t('description')}
        icon="LayoutDashboard"
      />

      {/* Zen Status Card: Unified Identity, Plan, & Credits */}
      <Card className="overflow-hidden shadow-sm border-border/60">
        <div className="grid md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border/60">

          {/* 1. Identity Zone */}
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-4 bg-background/50">
            <div className="relative">
              <Avatar className="h-20 w-20 border-4 border-background shadow-xl">
                <AvatarImage src={user.image || ''} />
                <AvatarFallback className="text-lg bg-primary/10 text-primary font-bold">
                  {user.name?.charAt(0).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="absolute bottom-0 right-0 bg-green-500 h-5 w-5 rounded-full border-4 border-background" />
            </div>

            <div className="space-y-1">
              <h3 className="font-bold text-lg">{user.name}</h3>
              <p className="text-sm text-muted-foreground font-medium">{user.email}</p>
            </div>

            <Button asChild variant="outline" size="sm" className="rounded-full px-6 h-8 text-xs font-medium border-primary/20 hover:border-primary/50 hover:bg-primary/5 hover:text-primary transition-all">
              <Link href="/settings/profile">
                {t('cards.profile.title')}
              </Link>
            </Button>
          </div>

          {/* 2. Subscription Zone */}
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-4 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent opacity-50 group-hover:opacity-100 transition-opacity" />

            <div className="relative z-10 flex flex-col items-center space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
                {t('labels.current_plan')}
              </div>
              <div className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary fill-current" />
                <span className="text-2xl font-bold tracking-tight text-foreground">
                  {currentSubscription?.planName || t('labels.no_subscription')}
                </span>
              </div>
              {nextRenewal && (
                <div className="text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded-full border border-border/50 shadow-sm">
                  {t('labels.renews_on', { date: nextRenewal })}
                </div>
              )}
            </div>

            <div className="relative z-10 pt-2">
              {currentSubscription ? (
                <Button asChild size="sm" className="rounded-full shadow-lg hover:shadow-primary/25 transition-all bg-foreground text-background hover:bg-foreground/90">
                  <Link href="/settings/billing">
                    {t('actions.manage')}
                  </Link>
                </Button>
              ) : (
                <Button asChild size="sm" className="rounded-full shadow-lg shadow-primary/20 hover:scale-105 transition-all">
                  <Link href="/pricing">
                    {t('actions.upgrade')}
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {/* 3. Credits Zone */}
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-4 bg-background/50">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80">
              {t('labels.remaining_credits')}
            </div>

            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-black tabular-nums tracking-tighter text-foreground">
                {remainingCredits}
              </span>
              <span className="text-sm font-medium text-muted-foreground">pts</span>
            </div>

            <Button asChild variant="ghost" size="sm" className="rounded-full text-primary hover:text-primary hover:bg-primary/10 group">
              <Link href="/pricing" className="flex items-center gap-1">
                {t('actions.buy_credits')}
                <ChevronRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Button>
          </div>

        </div>
      </Card>

      {/* Recent Activity Section */}
      <div className="pt-2">
        <div className="flex items-center justify-between mb-4 px-2">
          <h3 className="text-lg font-semibold tracking-tight">{t('cards.recent_orders.title')}</h3>
          <Button asChild variant="link" className="text-muted-foreground hover:text-foreground h-auto p-0 text-sm">
            <Link href="/settings/invoices" className="flex items-center gap-1">
              View All <ChevronRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>

        <Card className="border-border/60 bg-transparent shadow-none">
          {recentOrders.length > 0 ? (
            <div className="divide-y divide-border/60">
              {recentOrders.map((o) => (
                <div
                  key={o.orderNo}
                  className="flex items-center justify-between gap-4 px-4 py-4 hover:bg-muted/30 transition-colors first:rounded-t-lg last:rounded-b-lg"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="rounded-full bg-muted p-2.5 text-muted-foreground">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-foreground">
                        {o.productName || o.orderNo}
                      </div>
                      <div className="text-muted-foreground text-xs font-medium">
                        {moment(o.createdAt).format('MMM D, YYYY')}
                      </div>
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
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-3 bg-muted/20 rounded-lg border border-dashed border-border/60">
              <div className="p-3 bg-muted/30 rounded-full">
                <FileText className="h-6 w-6 text-muted-foreground/60" />
              </div>
              <div className="text-muted-foreground text-sm">{t('labels.no_orders')}</div>
            </div>
          )}
        </Card>
      </div>

    </div>
  );
}
