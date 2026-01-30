'use client';

import { useLocale, useTranslations } from 'next-intl';
import { RiGithubFill, RiGoogleFill } from 'react-icons/ri';
import { toast } from 'sonner';

import { signIn } from '@/core/auth/client';
import { stripLocalePrefix } from '@/core/i18n/href';
import { useRouter } from '@/core/i18n/navigation';
import { defaultLocale } from '@/config/locale';
import { Button } from '@/shared/components/ui/button';
import { sanitizeCallbackUrl } from '@/shared/lib/safe-redirect';
import { cn } from '@/shared/lib/utils';
import { Button as ButtonType } from '@/shared/types/blocks/common';

export function SocialProviders({
  configs,
  callbackUrl,
  loading,
  setLoading,
}: {
  configs: Record<string, string>;
  callbackUrl: string;
  loading: boolean;
  setLoading: (loading: boolean) => void;
}) {
  const t = useTranslations('common.sign');
  const router = useRouter();

  const locale = useLocale();
  const safeCallbackUrl = sanitizeCallbackUrl(callbackUrl, '/');
  let localizedCallbackUrl = safeCallbackUrl;
  if (
    locale !== defaultLocale &&
    safeCallbackUrl.startsWith('/') &&
    !safeCallbackUrl.startsWith(`/${locale}`)
  ) {
    localizedCallbackUrl = `/${locale}${safeCallbackUrl}`;
  }

  const callbackHref = stripLocalePrefix(localizedCallbackUrl);

  const handleSignIn = async ({ provider }: { provider: string }) => {
    await signIn.social(
      {
        provider: provider,
        callbackURL: localizedCallbackUrl,
      },
      {
        onRequest: (ctx) => {
          setLoading(true);
        },
        onResponse: (ctx) => {
          setLoading(false);
        },
        onSuccess: async (ctx) => {
          router.push(callbackHref);
        },
        onError: (e: any) => {
          toast.error(e?.error?.message || 'sign in failed');
          setLoading(false);
        },
      }
    );
  };

  const providers: ButtonType[] = [];

  if (configs.google_auth_enabled === 'true') {
    providers.push({
      name: 'google',
      title: t('google_sign_in_title'),
      icon: <RiGoogleFill />,
      onClick: () => handleSignIn({ provider: 'google' }),
    });
  }

  if (configs.github_auth_enabled === 'true') {
    providers.push({
      name: 'github',
      title: t('github_sign_in_title'),
      icon: <RiGithubFill />,
      onClick: () => handleSignIn({ provider: 'github' }),
    });
  }

  // Show loading skeleton if configs haven't been loaded yet
  const isConfigsLoaded = Object.keys(configs).length > 0;

  if (!isConfigsLoaded) {
    return (
      <div className={cn('flex w-full items-center gap-2', 'flex-col justify-between')}>
        {/* Skeleton loaders for potential social buttons */}
        <div className="w-full h-10 bg-white/5 animate-pulse rounded-md" />
        <div className="w-full h-10 bg-white/5 animate-pulse rounded-md" />
      </div>
    );
  }

  // Don't render anything if no providers are enabled
  if (providers.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'flex w-full items-center gap-2',
        'flex-col justify-between'
      )}
    >
      {providers.map((provider) => (
        <Button
          key={provider.name}
          variant="outline"
          className={cn('w-full gap-2')}
          disabled={loading}
          onClick={provider.onClick}
        >
          {provider.icon}
          <h3>{provider.title}</h3>
        </Button>
      ))}
    </div>
  );
}
