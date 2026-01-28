'use client';

import { useSearchParams } from 'next/navigation';

import { stripLocalePrefix } from '@/core/i18n/href';
import { usePathname, useRouter } from '@/core/i18n/navigation';
import { sanitizeCallbackUrl } from '@/shared/lib/safe-redirect';

/**
 * Redirect to the sign-in page, preserving a safe callbackUrl.
 *
 * We keep this tiny and centralized so every "requires auth" UI action behaves
 * consistently (and we don't resurrect the modal logic elsewhere).
 */
export function useSignInRedirect(defaultCallbackUrl: string = '/') {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (callbackUrl?: string) => {
    const search = searchParams.toString();
    const currentHref = `${pathname}${search ? `?${search}` : ''}`;
    const rawCallback = callbackUrl ?? currentHref;

    const callbackWithoutLocale = stripLocalePrefix(rawCallback);
    const safeCallbackUrl = sanitizeCallbackUrl(
      callbackWithoutLocale,
      defaultCallbackUrl
    );

    router.push(`/sign-in?callbackUrl=${encodeURIComponent(safeCallbackUrl)}`);
  };
}

