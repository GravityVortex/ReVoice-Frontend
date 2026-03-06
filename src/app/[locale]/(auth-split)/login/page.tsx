import { getTranslations } from 'next-intl/server';

import { redirect } from '@/core/i18n/navigation';
import { buildFullUrl } from '@/shared/lib/seo';
import { sanitizeCallbackUrl } from '@/shared/lib/safe-redirect';

export async function generateMetadata({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    const t = await getTranslations('common.sign');

    return {
        title: `${t('sign_in_title')} - ${t('sign_in_description')}`,
        alternates: {
            canonical: buildFullUrl('/login', locale),
        },
        robots: { index: false, follow: false },
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
