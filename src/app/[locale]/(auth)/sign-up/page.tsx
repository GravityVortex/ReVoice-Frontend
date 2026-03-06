import { getTranslations } from 'next-intl/server';

import { SignUp } from '@/shared/blocks/sign/sign-up';
import { buildFullUrl } from '@/shared/lib/seo';
import { sanitizeCallbackUrl } from '@/shared/lib/safe-redirect';
import { getConfigs } from '@/shared/models/config';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('common');

  return {
    title: `${t('sign.sign_up_title')} - ${t('metadata.title')}`,
    alternates: {
      canonical: buildFullUrl('/sign-up', locale),
    },
    robots: { index: false, follow: false },
  };
}

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  const configs = await getConfigs();

  return (
    <SignUp
      configs={configs}
      callbackUrl={sanitizeCallbackUrl(callbackUrl, '/')}
    />
  );
}
