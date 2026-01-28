import { getTranslations } from 'next-intl/server';

import { envConfigs } from '@/config';
import { defaultLocale } from '@/config/locale';
import { redirect } from '@/core/i18n/navigation';
import { sanitizeCallbackUrl } from '@/shared/lib/safe-redirect';

export async function generateMetadata({
    params,
    searchParams,
}: {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ callbackUrl?: string }>;
}) {
    const { locale } = await params;
    const { callbackUrl } = await searchParams;
    const t = await getTranslations('common.sign');

    return {
        title: `${t('sign_in_title')} - ${t('sign_in_description')}`,
        alternates: {
            canonical:
                locale !== defaultLocale
                    ? `${envConfigs.app_url}/${locale}/sign-in`
                    : `${envConfigs.app_url}/sign-in`,
        },
    };
}

export default async function LoginPage({
    searchParams,
    params,
}: {
    searchParams: Promise<{ callbackUrl?: string }>;
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    const { callbackUrl } = await searchParams;

    const safeCallbackUrl = sanitizeCallbackUrl(callbackUrl, '/');
    redirect({
        href: `/sign-in?callbackUrl=${encodeURIComponent(safeCallbackUrl)}`,
        locale,
    });
}
