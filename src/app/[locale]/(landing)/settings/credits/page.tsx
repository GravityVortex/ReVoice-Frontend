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

  const safeParseJson = (value: unknown) => {
    if (!value || typeof value !== 'string') return null;
    try {
      return JSON.parse(value) as Record<string, any>;
    } catch {
      return null;
    }
  };

  const getCreditDescription = (item: Credit) => {
    const raw = item.description || '';
    const scene = (item.transactionScene || '').trim();
    const meta = safeParseJson(item.metadata);

    // AI tasks: description is often hard-coded in English. Prefer metadata when present.
    if (meta?.type === 'ai-task') {
      return t('descriptions.consume.ai_task', {
        mediaType: meta?.mediaType || scene || raw || 'AI',
      });
    }

    if (item.transactionType === CreditTransactionType.CONSUME) {
      if (scene === 'convert_video') return t('descriptions.consume.convert_video');
      if (scene === 'subtitle_retranslate') return t('descriptions.consume.subtitle_retranslate');
      if (scene === 'audio_regen') return t('descriptions.consume.audio_regen');
      return raw || '-';
    }

    if (item.transactionType === CreditTransactionType.GRANT) {
      if (scene === 'payment') return t('descriptions.grant.payment');
      if (scene === 'subscription') return t('descriptions.grant.subscription');
      if (scene === 'renewal') return t('descriptions.grant.renewal');
      if (scene === 'promo') return t('descriptions.grant.promo');
      if (scene === 'promo_entitlement') return t('descriptions.grant.promo_entitlement');
      if (scene === 'admin give') return t('descriptions.grant.admin');
      return raw || '-';
    }

    return raw || '-';
  };

  const table: Table = {
    title: t('list.title'),
    columns: [
      {
        name: 'description',
        title: t('fields.description'),
        callback: (item: Credit) => (
          <div className="min-w-0">
            <div className="truncate font-medium">{getCreditDescription(item)}</div>
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
              {item.status === CreditStatus.DELETED ? (
                <span className="text-green-500">({t('labels.refunded')})</span>
              ) : null}
            </div>;
          }
        },
      },
      {
        name: 'expiresAt',
        title: t('fields.expires_at'),
        type: 'time',
        placeholder: '-',
        metadata: {
          format: {
            zh: 'YYYY年MM月DD日 HH:mm',
            en: 'MMM D, YYYY HH:mm',
          },
        },
        className: 'hidden lg:table-cell',
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
      is_active: type === 'consume' && statusFilter === CreditStatus.DELETED,
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
