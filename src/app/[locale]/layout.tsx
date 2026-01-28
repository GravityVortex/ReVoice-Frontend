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
    const user = await getSignUser();
    if (!user) {
      return null;
    }

    const [configs, isAdmin] = await Promise.all([
      getAllConfigs(),
      hasPermission(user.id, 'admin.access'),
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
    <NextIntlClientProvider>
      <ThemeProvider>
        <AppContextProvider initialUser={initialUser} initialConfigs={initialConfigs}>
          {children}
          <Toaster position="top-center" richColors />
        </AppContextProvider>
      </ThemeProvider>
    </NextIntlClientProvider>
  );
}
