import { notFound } from 'next/navigation';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';

import { routing } from '@/core/i18n/config';
import { ThemeProvider } from '@/core/theme/provider';
import { Toaster } from '@/shared/components/ui/sonner';
import { AppContextProvider } from '@/shared/contexts/app';
import { getMetadata } from '@/shared/lib/seo';
import { checkSoulDubAccess } from '@/shared/lib/souldub';
import { getAllConfigs, getPublicConfigs } from '@/shared/models/config';
import { getSignUser } from '@/shared/models/user';
import type { User } from '@/shared/models/user';
import { hasPermission } from '@/shared/services/rbac';

export const generateMetadata = getMetadata();

const SOFT_SSR_TIMEOUT_MS = 1500;

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([
    promise.finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    }),
    timeout,
  ]);
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  const initialConfigsPromise = getPublicConfigs();
  const initialUserPromise = (async (): Promise<User | null> => {
    // LocaleLayout gates client hydration (it contains our providers). If the DB/auth
    // backend is slow/unreachable, don't block the entire page and make the UI feel
    // "dead" (no clicks). Fail fast and degrade gracefully.
    const user = await withTimeout(getSignUser(), SOFT_SSR_TIMEOUT_MS, 'getSignUser()')
      .catch((e) => {
        return undefined;
      });
    if (!user) {
      return null;
    }

    const [configs, isAdmin] = await Promise.all([
      getAllConfigs().catch((e) => {
        return {};
      }),
      withTimeout(
        hasPermission(user.id, 'admin.access'),
        SOFT_SSR_TIMEOUT_MS,
        'hasPermission(admin.access)'
      ).catch((e) => {
        return false;
      }),
    ]);

    return {
      ...(user as User),
      image: user.image ?? null,
      data: (user as any).data ?? null,
      isAdmin,
      souldubAccess: checkSoulDubAccess(user.email, configs, isAdmin),
    };
  })();

  const [initialConfigs, initialUser] = await Promise.all([
    initialConfigsPromise,
    initialUserPromise,
  ]);

  return (
    <NextIntlClientProvider locale={locale}>
      <ThemeProvider>
        <AppContextProvider initialUser={initialUser} initialConfigs={initialConfigs}>
          {children}
          <Toaster position="top-center" richColors />
        </AppContextProvider>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
