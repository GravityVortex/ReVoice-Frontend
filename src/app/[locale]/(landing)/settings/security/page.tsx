import { getTranslations } from 'next-intl/server';

import { Link } from '@/core/i18n/navigation';
import { Empty } from '@/shared/blocks/common';
import { ConsolePageHeader } from '@/shared/blocks/console/page-header';
import { Button } from '@/shared/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/components/ui/card';
import { getUserInfo } from '@/shared/models/user';

export default async function SecurityPage() {
  const user = await getUserInfo();
  if (!user) {
    return <Empty message="no auth" />;
  }

  const t = await getTranslations('settings.security');

  const email = user?.email || '';
  const isGuest = email.startsWith('guest_') && email.endsWith('@temp.local');

  return (
    <div className="space-y-8">
      <ConsolePageHeader
        title={t('page.title')}
        description={t('page.description')}
        icon="Shield"
      />

      {isGuest ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('guest.title')}</CardTitle>
            <CardDescription>{t('guest.description')}</CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <div className="text-muted-foreground text-sm">
              {email}
            </div>
            <Button asChild variant="outline" size="sm" className="rounded-full">
              <Link href="/settings/profile">{t('guest.button')}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('reset_password.title')}</CardTitle>
            <CardDescription>{t('reset_password.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-muted-foreground text-sm">
              {t('reset_password.tip')}
            </div>
            <div className="flex justify-end">
              <Button disabled variant="outline" size="sm" className="rounded-full">
                {t('common.coming_soon')}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('delete_account.title')}</CardTitle>
            <CardDescription>{t('delete_account.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-muted-foreground text-sm">
              {t('delete_account.tip')}
            </div>
            <div className="flex justify-end">
              <Button disabled variant="destructive" size="sm" className="rounded-full">
                {t('common.coming_soon')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
