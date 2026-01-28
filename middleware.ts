import type { NextRequest } from 'next/server';

import proxy from './src/proxy';

export default function middleware(request: NextRequest) {
  return proxy(request);
}

// Next.js requires `config` to be declared in this file (it must be statically analyzable).
export const config = {
  matcher:
    '/((?!api|trpc|_next|_vercel|privacy|terms|privacy-policy|terms-of-service|.*\\..*).*)',
};
