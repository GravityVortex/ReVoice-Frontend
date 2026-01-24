import { createAuthClient } from 'better-auth/react';

// auth client for client-side use
export const authClient = createAuthClient({
  // Reduce /get-session chatter without changing auth logic:
  // - keep initial fetch + cross-tab broadcast updates
  // - avoid refetch-on-focus storms (esp. in dev / tab switching)
  sessionOptions: {
    refetchOnWindowFocus: false,
    // Poll logged-in sessions at a sane cadence (seconds). Set to 0 to disable polling entirely.
    refetchInterval: 60,
  },
});

// export auth client methods
export const { signIn, signUp, signOut, useSession } = authClient;

// get auth client with configs
export function getAuthClient() {
  return authClient;
}
