'use client';

import { useState } from 'react';
import { Loader2, UserRound } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { signIn } from '@/core/auth/client';
import { Link, useRouter } from '@/core/i18n/navigation';
import { defaultLocale } from '@/config/locale';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { useAppContext } from '@/shared/contexts/app';

import { SocialProviders } from './social-providers';
// 客户端工具
import { generateFingerprint, getBrowserMetadata } from '@/shared/lib/fingerprint';
// 服务端工具
import { generateGuestId, generateGuestEmail, generateGuestPassword } from '@/shared/models/guest-user';

export function SignInForm({
  callbackUrl = '/',
  className,
}: {
  callbackUrl: string;
  className?: string;
}) {
  const t = useTranslations('common.sign');
  const router = useRouter();
  let [email, setEmail] = useState('');
  let [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const { configs } = useAppContext();

  const isGoogleAuthEnabled = configs.google_auth_enabled === 'true';
  const isGithubAuthEnabled = configs.github_auth_enabled === 'true';
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
          onSuccess: (ctx) => {},
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
  // 法二：调用better-auth的登录
  const handleGuestLogin2 = async () => {
    const fingerprint = await generateFingerprint();
    const guestId = generateGuestId(fingerprint);
    email = generateGuestEmail(guestId);
    password = generateGuestPassword(guestId);
    // const name = `Guest_${guestId.substring(0, 6)}`;
    console.log('Guest login--->', { email, password });
    
    // setEmail(email);
    // setPassword(password);
    handleSignIn();
  
  };
  // 法一：调用自己后台接口处理
  const handleGuestLogin = async () => {
    if (loading) {
      return;
    }

    try {
      setLoading(true);
      
      // Generate device fingerprint
      const fingerprint = await generateFingerprint();
      const metadata = getBrowserMetadata();

      // Call guest login API to get/create guest credentials
      const response = await fetch('/api/auth/guest-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fingerprint,
          metadata,
        }),
      });

      if (!response.ok) {
        throw new Error('Guest login failed');
      }

      const result = await response.json();
      
      if (result.code !== 0) {
        throw new Error(result.message || 'Guest login failed');
      }

      const { email, password } = result.data;

      // Use standard better-auth signIn.email
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
          configs={configs}
          callbackUrl={callbackUrl || '/'}
          loading={loading}
          setLoading={setLoading}
        />

        {/* Guest Login Button */}
        <Button
          variant="outline"
          className="w-full gap-2"
          disabled={loading}
          onClick={handleGuestLogin}
        >
          <UserRound className="h-4 w-4" />
          <div className="flex flex-col items-start">
            <span className="text-sm font-medium">{t('guest_sign_in_title')}</span>
            <span className="text-xs text-muted-foreground">{t('guest_sign_in_description')}</span>
          </div>
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
