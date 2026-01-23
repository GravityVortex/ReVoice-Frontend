import { betterAuth } from 'better-auth';

import { getAuthOptions } from './config';

// Dynamic auth - with full database configuration
// Always use this in API routes that need database access
const AUTH_CACHE_MS = 30_000;
let cachedAuth:
  | Awaited<ReturnType<typeof betterAuth>>
  | null = null;
let cachedAt = 0;
let initPromise:
  | Promise<Awaited<ReturnType<typeof betterAuth>>>
  | null = null;

export async function getAuth(): Promise<
  Awaited<ReturnType<typeof betterAuth>>
> {
  const now = Date.now();
  if (cachedAuth && now - cachedAt < AUTH_CACHE_MS) {
    return cachedAuth;
  }

  if (!initPromise) {
    initPromise = (async () => {
      const auth = betterAuth(await getAuthOptions());
      cachedAuth = auth;
      cachedAt = Date.now();
      initPromise = null;
      return auth;
    })().catch((e) => {
      initPromise = null;
      throw e;
    });
  }

  return initPromise;
}
