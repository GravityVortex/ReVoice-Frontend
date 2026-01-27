'use client';

import { createAuthClient } from 'better-auth/react';

type AuthClient = ReturnType<typeof createAuthClient>;

declare global {
  // Prevent dev/HMR from spawning multiple session refresh timers.
  // eslint-disable-next-line no-var
  var __betterAuthClient: AuthClient | undefined;
}

function createClient(): AuthClient {
  return createAuthClient({
    // /api/auth/get-session is the "hot path" and should not be polled.
    // Refresh explicitly after auth mutations (sign-in/out) instead.
    sessionOptions: {
      refetchOnWindowFocus: false,
      refetchInterval: 0,
    },
  });
}

// auth client for client-side use
export const authClient: AuthClient =
  globalThis.__betterAuthClient ?? (globalThis.__betterAuthClient = createClient());

// export auth client methods
export const { signIn, signUp, signOut, useSession } = authClient;

// get auth client with configs
export function getAuthClient() {
  return authClient;
}
