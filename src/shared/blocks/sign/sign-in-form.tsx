'use client';

import { useState } from 'react';
import { Loader2, UserRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { signIn } from '@/core/auth/client';
import { Link } from '@/core/i18n/navigation';
import { defaultLocale } from '@/config/locale';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { useAppContext } from '@/shared/contexts/app';

import { SocialProviders } from './social-providers';
import { generateVisitorId, getVisitorInfo } from '@/shared/lib/fingerprint';

export function SignInForm({
  callbackUrl = '/',
  className,
}: {
  callbackUrl: string;
  className?: string;
}) {
  const t = useTranslations('common.sign');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const { configs } = useAppContext();

  // Override: Always enable social login for Vozo-like experience
  const isGoogleAuthEnabled = true; // configs.google_auth_enabled === 'true';
  const isGithubAuthEnabled = true; // configs.github_auth_enabled === 'true';
  const isEmailAuthEnabled =
    configs.email_auth_enabled !== 'false' ||
    (!isGoogleAuthEnabled && !isGithubAuthEnabled); // no social providers enabled, auto enable email auth

  if (callbackUrl) {
    const locale = useLocale();
    if (
      locale !== defaultLocale &&
      callbackUrl.startsWith('/') &&
      !callbackUrl.startsWith(`/${locale}`)
    ) {
      callbackUrl = `/${locale}${callbackUrl}`;
    }
  }

  const handleSignIn = async () => {
    if (loading) {
      return;
    }

    if (!email || !password) {
      toast.error('email and password are required');
      return;
    }

    try {
      setLoading(true);
      await signIn.email(
        {
          email,
          password,
          callbackURL: callbackUrl,
        },
        {
          onRequest: (ctx) => {
            setLoading(true);
          },
          onResponse: (ctx) => {
            setLoading(false);
          },
          onSuccess: (ctx) => { },
          onError: (e: any) => {
            toast.error(e?.error?.message || 'sign in failed');
            setLoading(false);
          },
        }
      );
    } catch (e: any) {
      toast.error(e.message || 'sign in failed');
    } finally {
      setLoading(false);
    }
  };
  // 访客登录 - 使用稳定的跨浏览器访客 ID
  // 法一：调用自己后台接口处理
  const handleGuestLogin = async () => {
    if (loading) {
      return;
    }
    try {
      setLoading(true);
      // 生成稳定的访客 ID（基于硬件指纹，跨浏览器一致）
      const visitorId = await generateVisitorId();
      const visitorInfo = await getVisitorInfo();

      // 调用访客登录 API 获取/创建访客凭证
      // 硬件指纹在同一台电脑的不同浏览器上是一致的
      const response = await fetch('/api/auth/guest-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          visitorId,
          fingerprint: visitorId, // backward compatibility
          metadata: visitorInfo.metadata,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.message || 'Guest login failed');
      }
      if (!result || result.code !== 0) {
        throw new Error(result?.message || 'Guest login failed');
      }

      const guestEmail = result.data?.email;
      const guestPassword = result.data?.password;
      if (!guestEmail || !guestPassword) {
        throw new Error('Failed to obtain guest credentials');
      }

      // 使用标准 better-auth 登录
      await signIn.email(
        {
          email: guestEmail,
          password: guestPassword,
          callbackURL: callbackUrl,
        },
        {
          onRequest: (ctx) => {
            setLoading(true);
          },
          onResponse: (ctx) => {
            setLoading(false);
          },
          onSuccess: (ctx) => {
            toast.success('Guest login successful!');
          },
          onError: (e: any) => {
            toast.error(e?.error?.message || 'Guest login failed');
            setLoading(false);
          },
        }
      );
    } catch (e: any) {
      toast.error(e.message || 'Guest login failed');
      setLoading(false);
    }
  };

  return (
    <div className={`w-full md:max-w-md ${className}`}>
      <div className="grid gap-4">
        {isEmailAuthEnabled && (
          <>
            {/* 油箱输入框 */}
            <div className="grid gap-2">
              <Label htmlFor="email">{t('email_title')}</Label>
              <Input
                id="email"
                type="email"
                placeholder={t('email_placeholder')}
                required
                onChange={(e) => {
                  setEmail(e.target.value);
                }}
                value={email}
              />
            </div>

            <div className="grid gap-2">
              {/* <div className="flex items-center">
              <Label htmlFor="password">{t("password_title")}</Label>
              <Link href="#" className="ml-auto inline-block text-sm underline">
                Forgot your password?
              </Link>
            </div> */}
              {/* 密码输入框 */}
              <Input
                id="password"
                type="password"
                placeholder={t('password_placeholder')}
                autoComplete="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {/* <div className="flex items-center gap-2">
            <Checkbox
              id="remember"
              onClick={() => {
                setRememberMe(!rememberMe);
              }}
            />
            <Label htmlFor="remember">{t("remember_me_title")}</Label>
          </div> */}

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
              onClick={handleSignIn}
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <p> {t('sign_in_title')} </p>
              )}
            </Button>
          </>
        )}

        <SocialProviders
          configs={{
            ...configs,
            google_auth_enabled: 'true',
            github_auth_enabled: 'true',
          }}
          callbackUrl={callbackUrl || '/'}
          loading={loading}
          setLoading={setLoading}
        />

        {/* Guest Login Button */}
        <Button
          variant="outline"
          className="h-auto w-full flex-col gap-1 py-4 hover:border-primary/50 hover:bg-accent/50"
          onClick={handleGuestLogin}
          disabled={loading}
        >
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4" />
            <span className="font-medium">{t('guest_sign_in_title')}</span>
          </div>
          <span className="text-xs font-normal text-muted-foreground/80">
            {t('guest_sign_in_description')}
          </span>
        </Button>
      </div>
      {isEmailAuthEnabled && (
        <div className="flex w-full justify-center border-t py-4">
          <p className="text-center text-xs text-neutral-500">
            {t('no_account')}
            <Link href="/sign-up" className="underline">
              <span className="cursor-pointer dark:text-white/70">
                {t('sign_up_title')}
              </span>
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
