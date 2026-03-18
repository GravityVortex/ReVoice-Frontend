'use client';

import { useLocale, useTranslations } from 'next-intl';
import { RiGithubFill, RiGoogleFill } from 'react-icons/ri';
import { toast } from 'sonner';

import { signIn } from '@/core/auth/client';
import { defaultLocale } from '@/config/locale';
import { Button } from '@/shared/components/ui/button';
import { sanitizeCallbackUrl } from '@/shared/lib/safe-redirect';
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

  const handleSignIn = async (provider: string) => {
    if (loading) return;
    setLoading(true);

    try {
      await signIn.social({
        provider: provider as 'google' | 'github',
        callbackURL: localizedCallbackUrl,
      });
    } catch (e: any) {
      setLoading(false);
      toast.error(e?.message || t('login_failed'));
    }
  };

  const providers: ButtonType[] = [];

  if (configs.google_client_id) {
    providers.push({
      name: 'google',
      title: t('google_sign_in_title'),
      icon: <RiGoogleFill className="w-5 h-5" />,
      onClick: () => handleSignIn('google'),
    });
  }

  if (configs.github_client_id) {
    providers.push({
      name: 'github',
      title: t('github_sign_in_title'),
      icon: <RiGithubFill className="w-5 h-5" />,
      onClick: () => handleSignIn('github'),
    });
  }

  if (providers.length === 0) {
    return null;
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {isEmailAuthEnabled(configs) && (
        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-white/8" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-3 text-muted-foreground/60">
              {t('or_continue_with')}
            </span>
          </div>
        </div>
      )}
      {providers.map((provider) => (
        <Button
          key={provider.name}
          variant="outline"
          className="w-full h-11 gap-2 font-medium bg-white/2 hover:bg-white/5 border-white/10 hover:border-white/15 transition-all"
          disabled={loading}
          onClick={provider.onClick}
        >
          {provider.icon}
          <span>{provider.title}</span>
        </Button>
      ))}
    </div>
  );
}

function isEmailAuthEnabled(configs: Record<string, string>) {
  const hasGoogleProvider = Boolean(configs.google_client_id);
  const hasGithubProvider = Boolean(configs.github_client_id);
  return configs.email_auth_enabled !== 'false' || (!hasGoogleProvider && !hasGithubProvider);
}
