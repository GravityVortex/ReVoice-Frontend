import { createAuthClient } from 'better-auth/react';

import { envConfigs } from '@/config';

// auth client for client-side use
export const authClient = createAuthClient({
  baseURL: envConfigs.auth_url,
  secret: envConfigs.auth_secret,
  // pollingInterval: 5000, // 每5秒轮询一次，0禁用轮询
});

// export auth client methods
export const { signIn, signUp, signOut, useSession } = authClient;

// get auth client with configs
export function getAuthClient() {
  return createAuthClient({
    baseURL: envConfigs.auth_url,
    secret: envConfigs.auth_secret,
    // pollingInterval: 5000, // 每5秒轮询一次，0禁用轮询
  });
}
