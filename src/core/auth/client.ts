'use client';

import { createAuthClient } from 'better-auth/react';

type AuthClient = ReturnType<typeof createAuthClient>;

// NOTE: Avoid caching this client on `globalThis`.
// Turbopack HMR can invalidate module factories; holding onto old client instances
// across hot updates is a good way to get hard-to-reproduce runtime crashes.
export const authClient: AuthClient = createAuthClient({
  // /api/auth/get-session is the "hot path" and should not be polled.
  // Refresh explicitly after auth mutations (sign-in/out) instead.
  sessionOptions: {
    refetchOnWindowFocus: false,
    refetchInterval: 0,
  },
});

// export auth client methods
export const { signIn, signUp, signOut, useSession } = authClient;

// get auth client with configs
export function getAuthClient() {
  return authClient;
}
