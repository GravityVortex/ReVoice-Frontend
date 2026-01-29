import { NextRequest, NextResponse } from 'next/server';
import { getSessionCookie } from 'better-auth/cookies';
import createIntlMiddleware from 'next-intl/middleware';

import { routing } from '@/core/i18n/config';

const intlMiddleware = createIntlMiddleware(routing);

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip internal Next.js paths, static files, and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/_vercel') ||
    pathname.match(/\.[a-zA-Z0-9]+$/) ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/trpc')
  ) {
    return NextResponse.next();
  }

  // Skip legal pages (no locale prefix)
  if (
    pathname === '/privacy' ||
    pathname === '/terms' ||
    pathname === '/privacy-policy' ||
    pathname === '/terms-of-service'
  ) {
    return NextResponse.next();
  }

  // Let next-intl handle locale routing FIRST
  const intlResponse = intlMiddleware(request);

  // Extract locale AFTER next-intl has processed the request
  // This ensures we get the correct locale that next-intl determined
  const locale = intlResponse.headers.get('x-next-intl-locale') ||
    pathname.split('/')[1];
  const isValidLocale = routing.locales.includes(locale as any);

  // Calculate path without locale for auth checks
  const pathWithoutLocale = isValidLocale && pathname.startsWith(`/${locale}`)
    ? pathname.slice(locale.length + 1) || '/'
    : pathname;

  // Auth check for protected routes
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
      signInUrl.searchParams.set('callbackUrl', pathWithoutLocale + request.nextUrl.search);
      return NextResponse.redirect(signInUrl);
    }
  }

  return intlResponse;
}

// Next.js requires `config` to be declared in this file (it must be statically analyzable).
export const config = {
  // Match all pathnames except for
  // - paths that start with `/api`, `/trpc`, `/_next` or `/_vercel`
  // - paths containing a dot (e.g. `favicon.ico`)
  matcher: ['/((?!api|trpc|_next|_vercel|.*\\..*).*)'],
};
