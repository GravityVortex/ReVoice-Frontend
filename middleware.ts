import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import createIntlMiddleware from 'next-intl/middleware';

import { routing } from '@/core/i18n/config';

const intlMiddleware = createIntlMiddleware(routing);

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Extract locale from pathname first.
  const locale = pathname.split('/')[1];
  const isValidLocale = routing.locales.includes(locale as any);
  const pathWithoutLocale = isValidLocale
    ? pathname.slice(locale.length + 1)
    : pathname;

  // Handle incorrectly locale-prefixed internal assets (e.g. `/zh/_next/...`).
  // These need to be rewritten to the canonical path without locale prefix.
  const isNextInternal =
    pathWithoutLocale.startsWith('/_next') ||
    pathWithoutLocale.startsWith('/_vercel');

  if (isValidLocale && isNextInternal) {
    const url = request.nextUrl.clone();
    url.pathname = pathWithoutLocale;
    return NextResponse.rewrite(url);
  }

  const isApiRoute =
    pathname.startsWith('/api') || pathname.startsWith('/trpc');
  const isPublicFile = pathname.includes('.');
  const isStableRootPage =
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/privacy-policy' ||
    pathname === '/terms-of-service';

  if (isApiRoute || isPublicFile || isStableRootPage) {
    return NextResponse.next();
  }

  // Run i18n routing only for real pages.
  const intlResponse = intlMiddleware(request);

  // If the request has no locale prefix, let next-intl do its redirect first.
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

  // Debug headers help trace routing issues (safe; not sensitive).
  intlResponse.headers.set('x-pathname', request.nextUrl.pathname);
  intlResponse.headers.set('x-url', request.url);

  return intlResponse;
}

// Next.js requires `config` to be declared in this file (it must be statically analyzable).
export const config = {
  matcher: [
    // Catch locale-prefixed internal assets so we can rewrite them.
    '/:locale(en|zh)/_next/:path*',
    '/:locale(en|zh)/_vercel/:path*',
    // Standard matcher for pages.
    '/((?!api|trpc|_next|_vercel|privacy|terms|privacy-policy|terms-of-service|.*\\..*).*)',
  ],
};
