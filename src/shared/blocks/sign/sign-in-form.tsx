'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { signIn } from '@/core/auth/client';
import { Link, useRouter } from '@/core/i18n/navigation';
import { defaultLocale } from '@/config/locale';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { useAppContext } from '@/shared/contexts/app';
import { sanitizeCallbackUrl } from '@/shared/lib/safe-redirect';

import { SocialProviders } from './social-providers';

export function SignInForm({
  callbackUrl = '/',
  className,
}: {
  callbackUrl: string;
  className?: string;
}) {
  const t = useTranslations('common.sign');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [signInState, setSignInState] = useState<'idle' | 'loading' | 'success'>('idle');

  const loading = signInState !== 'idle';
  const setLoading = (v: boolean) => setSignInState(v ? 'loading' : 'idle');

  const { configs } = useAppContext();

  const hasGoogleProvider = Boolean(configs.google_client_id);
  const hasGithubProvider = Boolean(configs.github_client_id);
  const isEmailAuthEnabled =
    configs.email_auth_enabled !== 'false' ||
    (!hasGoogleProvider && !hasGithubProvider); // no social providers configured, auto enable email auth

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

  const handleSignIn = async () => {
    if (signInState !== 'idle') return;

    if (!email || !password) {
      toast.error(t('email_password_required'));
      return;
    }

    try {
      setSignInState('loading');
      const { error } = await signIn.email(
        { email, password },
        {
          onError: (e: any) => {
            toast.error(e?.error?.message || t('login_failed'));
          },
        }
      );

      if (error) {
        setSignInState('idle');
        return;
      }

      setSignInState('success');
      router.refresh();
      router.push(localizedCallbackUrl);
    } catch (e: any) {
      toast.error(e.message || t('login_failed'));
      setSignInState('idle');
    }
  };

  return (
    <div className={`w-full ${className}`}>
      <div className="grid gap-5">
        {isEmailAuthEnabled && (
          <>
            {/* Email input */}
            <div className="grid gap-2">
              <Label htmlFor="email" className="text-sm font-medium">{t('email_title')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('email_placeholder')}
                required
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
                value={email}
                className="h-11"
              />
            </div>

            <div className="grid gap-2">
              {/* Password input */}
              <Input
                id="password"
                type="password"
                placeholder={t('password_placeholder')}
                autoComplete="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-11"
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 font-medium shadow-lg shadow-primary/20 hover:shadow-primary/30 transition-shadow"
              disabled={loading}
              onClick={handleSignIn}
            >
              {signInState === 'success' ? (
                <span className="flex items-center gap-2 animate-in fade-in duration-300">
                  <Check size={16} />
                  {t('login_success')}
                </span>
              ) : signInState === 'loading' ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                t('sign_in_title')
              )}
            </Button>
          </>
        )}

        <SocialProviders
          configs={configs}
          callbackUrl={localizedCallbackUrl}
          loading={loading}
          setLoading={setLoading}
        />
      </div>
      {isEmailAuthEnabled && (
        <div className="flex w-full justify-center pt-5 mt-2 border-t border-white/6">
          <p className="text-center text-sm text-muted-foreground">
            {t('no_account')}{' '}
            <Link href="/sign-up" className="font-medium text-primary hover:text-primary/80 transition-colors">
              {t('sign_up_title')}
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
