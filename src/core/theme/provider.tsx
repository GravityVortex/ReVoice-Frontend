'use client';

import { ReactNode, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();

  useEffect(() => {
    if (typeof document !== 'undefined' && locale) {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  return (
    <NextThemesProvider
      attribute="class"
      // The app currently styles only a dark palette (see theme.css). Allowing
      // next-themes to switch to "light"/"system" drops the `.dark` class and
      // breaks `dark:` styles, causing unreadable black text in production.
      // Keep it simple: force dark until we actually implement a light theme.
      defaultTheme="dark"
      forcedTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
