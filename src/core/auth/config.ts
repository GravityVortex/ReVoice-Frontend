import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { oneTap } from 'better-auth/plugins';
import bcrypt from 'bcryptjs';

import { db } from '@/core/db';
import { envConfigs } from '@/config';
import * as schema from '@/config/db/schema';
import { getUuid, getShortUUID } from '@/shared/lib/hash';
import { getAllConfigs } from '@/shared/models/config';
import { createCredit, CreditStatus, CreditTransactionType } from '@/shared/models/credit';

// Static auth options - NO database connection
// This ensures zero database calls during build time
export const authOptions = {
  appName: envConfigs.app_name,
  baseURL: envConfigs.auth_url,
  secret: envConfigs.auth_secret,
  trustedOrigins: envConfigs.app_url ? [envConfigs.app_url] : [],
  advanced: {
    database: {
      generateId: () => getUuid(),
    },
  },
  emailAndPassword: {
    enabled: true,
    password: {
      // 使用 bcrypt 进行密码加密，确保与访客认证 API 一致
      hash: async (password: string) => {
        return await bcrypt.hash(password, 10);
      },
      verify: async ({ hash, password }: { hash: string; password: string }) => {
        return await bcrypt.compare(password, hash);
      },
    },
  },
  logger: {
    verboseLogging: false,
    // Disable all logs during build and production
    disabled: true,
  },
};

// Dynamic auth options - WITH database connection
// Only used in API routes that actually need database access
export async function getAuthOptions() {
  const configs = await getAllConfigs();
  return {
    ...authOptions,
    // Add database connection only when actually needed (runtime)
    database: envConfigs.database_url
      ? drizzleAdapter(db(), {
          provider: getDatabaseProvider(envConfigs.database_provider),
          schema: schema,
        })
      : null,
    emailAndPassword: {
      enabled: configs.email_auth_enabled !== 'false',
      password: {
        // 使用 bcrypt 进行密码加密，确保与访客认证 API 一致
        hash: async (password: string) => {
          return await bcrypt.hash(password, 10);
        },
        verify: async ({ hash, password }: { hash: string; password: string }) => {
          return await bcrypt.compare(password, hash);
        },
      },
    },
    socialProviders: await getSocialProviders(configs),
    plugins:
      configs.google_client_id && configs.google_one_tap_enabled === 'true'
        ? [oneTap()]
        : [],
  };
}

export async function getSocialProviders(configs: Record<string, string>) {
  // get configs from db
  const providers: any = {};

  if (configs.google_client_id && configs.google_client_secret) {
    providers.google = {
      clientId: configs.google_client_id,
      clientSecret: configs.google_client_secret,
    };
  }

  if (configs.github_client_id && configs.github_client_secret) {
    providers.github = {
      clientId: configs.github_client_id,
      clientSecret: configs.github_client_secret,
    };
  }

  return providers;
}

export function getDatabaseProvider(
  provider: string
): 'sqlite' | 'pg' | 'mysql' {
  switch (provider) {
    case 'sqlite':
      return 'sqlite';
    case 'postgresql':
      return 'pg';
    case 'mysql':
      return 'mysql';
    default:
      throw new Error(
        `Unsupported database provider for auth: ${envConfigs.database_provider}`
      );
  }
}
