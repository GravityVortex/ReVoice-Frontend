'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useLocale } from 'next-intl';

import { stripLocalePrefix } from '@/core/i18n/href';
import { usePathname, useRouter } from '@/core/i18n/navigation';
import { localeNames, locales } from '@/config/locale';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { cn } from '@/shared/lib/utils';

export function LocaleSelector() {
  const currentLocale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSwitchLanguage = (value: string) => {
    if (value !== currentLocale) {
      const search = searchParams.toString();
      const basePath = stripLocalePrefix(pathname);
      const href = search ? `${basePath}?${search}` : basePath;
      router.push(href, { locale: value });
    }
  };

  // 获取当前语言的简短显示名（根据当前语言环境）
  const getShortLocaleName = (locale: string, displayLocale: string) => {
    if (displayLocale === 'zh') {
      // 中文环境下显示中文
      return locale === 'zh' ? '中文' : locale.toUpperCase();
    }
    // 英文及其他环境下显示大写代码
    return locale.toUpperCase();
  };

  // Return a placeholder during SSR to avoid hydration mismatch
  if (!mounted) {
    return (
      <div className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium">
        <Globe size={16} />
        {getShortLocaleName(currentLocale, currentLocale)}
        <ChevronDown size={14} className="opacity-50" />
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-white/10">
          <Globe size={16} />
          {getShortLocaleName(currentLocale, currentLocale)}
          <ChevronDown size={14} className="opacity-50" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[120px]">
        {locales.map((locale) => (
          <DropdownMenuItem
            key={locale}
            onClick={() => handleSwitchLanguage(locale)}
            className={cn(
              'flex items-center justify-between',
              locale === currentLocale && 'bg-accent'
            )}
          >
            <span>{localeNames[locale]}</span>
            {locale === currentLocale && (
              <Check size={16} className="text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
