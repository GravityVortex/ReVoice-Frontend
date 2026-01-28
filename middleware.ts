export { default } from './src/proxy';

// Next.js requires `config` to be declared in this file (it must be statically analyzable).
export const config = {
  matcher:
    '/((?!api|trpc|_next|_vercel|privacy|terms|privacy-policy|terms-of-service|.*\\..*).*)',
};
