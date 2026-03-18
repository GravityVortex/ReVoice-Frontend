'use client';

import { useLocale, useTranslations } from 'next-intl';
import { RiGithubFill, RiGoogleFill } from 'react-icons/ri';
import { toast } from 'sonner';

import { signIn } from '@/core/auth/client';
import { useRouter } from '@/core/i18n/navigation';
import { defaultLocale } from '@/config/locale';
import { Button } from '@/shared/components/ui/button';
import { usePopupSignIn } from '@/shared/hooks/use-popup-sign-in';
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
  const router = useRouter();
  const { openPopup } = usePopupSignIn();

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

  const handlePopupSignIn = async (provider: string) => {
    if (loading) return;
    setLoading(true);

    // 1) 同步打开弹窗（保留用户手势上下文，避免浏览器拦截）
    const popup = openPopup('about:blank', {
      width: 500,
      height: 600,
      onSuccess: (cbUrl) => {
        setLoading(false);
        router.refresh();
        router.push(cbUrl);
      },
      onError: (error) => {
        setLoading(false);
        toast.error(error || t('login_failed'));
      },
      onClose: async () => {
        // All communication channels failed — check if OAuth actually succeeded
        // by verifying the session directly with the server.
        try {
          const resp = await fetch('/api/auth/get-session');
          if (resp.ok) {
            const data = await resp.json();
            if (data?.session?.userId) {
              setLoading(false);
              router.refresh();
              router.push(localizedCallbackUrl);
              return;
            }
          }
        } catch {}
        setLoading(false);
      },
    });

    if (!popup) {
      setLoading(false);
      toast.error(t('popup_blocked'));
      return;
    }

    try {
      // 2) 用 better-auth SDK 获取 OAuth URL（disableRedirect 阻止父窗口自动跳转）
      const popupCallbackUrl = `/${locale}/auth/popup-callback?callbackUrl=${encodeURIComponent(localizedCallbackUrl)}`;
      const { data, error } = await signIn.social({
        provider: provider as 'google' | 'github',
        callbackURL: popupCallbackUrl,
        disableRedirect: true,
      });

      if (error || !data?.url) {
        throw new Error((error as any)?.message || 'Failed to get OAuth URL');
      }

      // 3) 竞态防御：弹窗可能在请求期间被用户关闭
      if (popup.closed) {
        setLoading(false);
        return;
      }

      // 4) 将弹窗导航到 OAuth URL
      popup.location.href = data.url;
    } catch (e: any) {
      popup.close();
      setLoading(false);
      toast.error(e?.message || t('login_failed'));
    }
  };

  const providers: ButtonType[] = [];

  // OAuth is actually usable only when the provider is configured server-side.
  // The client can safely infer this from the public client id presence.
  if (configs.google_client_id) {
    providers.push({
      name: 'google',
      title: t('google_sign_in_title'),
      icon: <RiGoogleFill className="w-5 h-5" />,
      onClick: () => handlePopupSignIn('google'),
    });
  }

  if (configs.github_client_id) {
    providers.push({
      name: 'github',
      title: t('github_sign_in_title'),
      icon: <RiGithubFill className="w-5 h-5" />,
      onClick: () => handlePopupSignIn('github'),
    });
  }

  // Don't render anything if no providers are enabled
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
