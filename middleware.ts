import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import createIntlMiddleware from 'next-intl/middleware';

import { routing } from '@/core/i18n/config';

const intlMiddleware = createIntlMiddleware(routing);

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Extract locale from pathname.
  const locale = pathname.split('/')[1];
  const isValidLocale = routing.locales.includes(locale as any);
  const pathWithoutLocale = isValidLocale
    ? pathname.slice(locale.length + 1)
    : pathname;

  // If a locale prefix is present (e.g. `/en/_next/...`), normalize to the
  // canonical path (e.g. `/_next/...`) so static assets actually resolve.
  //
  // This happens in some Turbopack/dev setups where asset URLs become relative
  // to `/{locale}`.
  const isNextInternal =
    pathWithoutLocale.startsWith('/_next') ||
    pathWithoutLocale.startsWith('/_vercel');
  const isApiRoute =
    pathWithoutLocale.startsWith('/api') || pathWithoutLocale.startsWith('/trpc');
  const isPublicFile = pathWithoutLocale.includes('.');
  const isStableRootPage =
    pathWithoutLocale === '/privacy' ||
    pathWithoutLocale === '/terms' ||
    pathWithoutLocale === '/privacy-policy' ||
    pathWithoutLocale === '/terms-of-service';

  if (isNextInternal || isApiRoute || isPublicFile || isStableRootPage) {
    if (isValidLocale) {
      const url = request.nextUrl.clone();
      url.pathname = pathWithoutLocale;
      return NextResponse.rewrite(url);
    }
    return NextResponse.next();
  }

  // Run i18n routing only for real pages.
  const intlResponse = intlMiddleware(request);

  // If the request has no locale prefix, let next-intl do its redirect first.
  // This keeps auth redirects consistently locale-prefixed (e.g. `/en/sign-in`).
  if (!isValidLocale && intlResponse.headers.has('location')) {
    return intlResponse;
  }

  // Page-level redirect gate. APIs must enforce auth/ownership separately.
  if (
    pathWithoutLocale.startsWith('/admin') ||
    pathWithoutLocale.startsWith('/dashboard') ||
    pathWithoutLocale.startsWith('/settings') ||
    pathWithoutLocale.startsWith('/activity') ||
    pathWithoutLocale.startsWith('/video_convert') ||
    pathWithoutLocale.startsWith('/chat')
  ) {
    const sessionCookie = getSessionCookie(request);
    if (!sessionCookie) {
      const signInUrl = new URL(
        isValidLocale ? `/${locale}/sign-in` : '/sign-in',
        request.url
      );

      // Preserve the requested path + query (relative, without locale prefix).
      const callbackPath = pathWithoutLocale + request.nextUrl.search;
      signInUrl.searchParams.set('callbackUrl', callbackPath);
      return NextResponse.redirect(signInUrl);
    }
  }

  // Keep `/dashboard` as the canonical entry point, but serve the current
  // workspace implementation (video conversion list) without changing the URL.
  if (isValidLocale && pathWithoutLocale === '/dashboard') {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}/video_convert/myVideoList`;
    return NextResponse.rewrite(url, intlResponse);
  }

  // Debug headers help trace routing issues (safe; not sensitive).
  intlResponse.headers.set('x-pathname', request.nextUrl.pathname);
  intlResponse.headers.set('x-url', request.url);

  return intlResponse;
}

// Next.js requires `config` to be declared in this file (it must be statically analyzable).
export const config = {
  matcher: [
    // Handle locale-prefixed requests (including assets) so we can normalize them.
    '/:locale(en|zh)/:path*',
    '/((?!api|trpc|_next|_vercel|privacy|terms|privacy-policy|terms-of-service|.*\\..*).*)',
  ],
};
