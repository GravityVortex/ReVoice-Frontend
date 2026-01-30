import { getTranslations } from 'next-intl/server';

import { Empty } from '@/shared/blocks/common';
import { FormCard } from '@/shared/blocks/form';
import { Copy } from '@/shared/blocks/table/copy';
import { Button } from '@/shared/components/ui/button';
import { Link } from '@/core/i18n/navigation';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import {
  findApikeyById,
  updateApikey,
  UpdateApikey,
} from '@/shared/models/apikey';
import { getUserInfo } from '@/shared/models/user';
import { Crumb } from '@/shared/types/blocks/common';
import { Form as FormType } from '@/shared/types/blocks/form';

export default async function EditApiKeyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const apikey = await findApikeyById(id);
  if (!apikey) {
    return <Empty message="API key not found" />;
  }

  const user = await getUserInfo();
  if (!user) {
    return <Empty message="no auth" />;
  }

  if (apikey.userId !== user.id) {
    return <Empty message="no permission" />;
  }

  const t = await getTranslations('settings.apikeys');

  const form: FormType = {
    title: t('edit.title'),
    fields: [
      {
        name: 'title',
        title: t('fields.title'),
        type: 'text',
        placeholder: '',
        validation: { required: true },
      },
    ],
    passby: {
      user: user,
      apikey: apikey,
    },
    data: apikey,
    submit: {
      handler: async (data: FormData, passby: any) => {
        'use server';

        const { user, apikey } = passby;

        if (!apikey) {
          throw new Error('apikey not found');
        }

        if (!user) {
          throw new Error('no auth');
        }

        if (apikey.userId !== user.id) {
          throw new Error('no permission');
        }

        const title = data.get('title') as string;
        if (!title?.trim()) {
          throw new Error('title is required');
        }

        const updatedApikey: UpdateApikey = {
          title: title.trim(),
        };

        await updateApikey(apikey.id, updatedApikey);

        return {
          status: 'success',
          message: 'API Key updated',
          redirect_url: '/settings/apikeys',
        };
      },
      button: {
        title: t('edit.buttons.submit'),
      },
    },
  };

  const crumbs: Crumb[] = [
    {
      title: t('edit.crumbs.apikeys'),
      url: '/settings/apikeys',
    },
    {
      title: t('edit.crumbs.edit'),
      is_active: true,
    },
  ];

  return (
    <div className="space-y-8">
      {created === '1' ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('created.title')}</CardTitle>
            <CardDescription>{t('created.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-white/[0.03] border-white/10 flex items-center justify-between gap-3 rounded-xl border px-4 py-3">
              <div className="min-w-0">
                <div className="text-muted-foreground text-xs">
                  {t('fields.key')}
                </div>
                <div className="text-foreground font-mono text-xs md:text-sm truncate">
                  {apikey.key}
                </div>
              </div>
              <Copy value={apikey.key}>
                <span className="text-sm font-medium">
                  {t('created.buttons.copy')}
                </span>
              </Copy>
            </div>
            <div className="flex justify-end">
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link href="/settings/apikeys">{t('created.buttons.back')}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <FormCard title={t('edit.title')} crumbs={crumbs} form={form} />
    </div>
  );
}
