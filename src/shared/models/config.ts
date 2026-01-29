import { db } from '@/core/db';
import { envConfigs } from '@/config';
import { config } from '@/config/db/schema';

import { publicSettingNames } from '../services/settings';

export type Config = typeof config.$inferSelect;
export type NewConfig = typeof config.$inferInsert;
export type UpdateConfig = Partial<Omit<NewConfig, 'name'>>;

export type Configs = Record<string, string>;

const CONFIG_CACHE_MS = 30_000;
// We use configs to enrich the page (ads/analytics/etc). If the DB is slow/unreachable,
// don't block the entire request for ~10s connect timeouts.
const CONFIG_DB_TIMEOUT_MS = 1_500;
let cachedDbConfigs: Configs | null = null;
let cachedDbConfigsAt = 0;
let cachedDbConfigsErrorAt = 0;
let inflightDbConfigs: Promise<Configs> | null = null;

function invalidateConfigCache() {
  cachedDbConfigs = null;
  cachedDbConfigsAt = 0;
  cachedDbConfigsErrorAt = 0;
  inflightDbConfigs = null;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([
    promise.finally(() => {
      if (timeoutId) clearTimeout(timeoutId);
    }),
    timeout,
  ]);
}

export async function saveConfigs(configs: Record<string, string>) {
  const result = await db().transaction(async (tx) => {
    const configEntries = Object.entries(configs);
    const results = [];

    for (const [name, configValue] of configEntries) {
      const [upsertResult] = await tx
        .insert(config)
        .values({ name, value: configValue })
        .onConflictDoUpdate({
          target: config.name,
          set: { value: configValue },
        })
        .returning();

      results.push(upsertResult);
    }

    return results;
  });

  invalidateConfigCache();
  return result;
}

export async function addConfig(newConfig: NewConfig) {
  const [result] = await db().insert(config).values(newConfig).returning();

  invalidateConfigCache();
  return result;
}

export async function getConfigs(): Promise<Configs> {
  if (!envConfigs.database_url) {
    return {};
  }

  const now = Date.now();
  if (cachedDbConfigs && now - cachedDbConfigsAt < CONFIG_CACHE_MS) {
    // Callers sometimes mutate configs (e.g. admin settings save). Keep cache immutable by
    // always returning a fresh object.
    return { ...cachedDbConfigs };
  }

  // If the DB is currently unreachable, avoid retrying on every request and causing repeated
  // long hangs in SSR. We'll retry after the cache window elapses.
  if (cachedDbConfigsErrorAt && now - cachedDbConfigsErrorAt < CONFIG_CACHE_MS) {
    return {};
  }

  if (!inflightDbConfigs) {
    inflightDbConfigs = (async () => {
      const rows = await withTimeout(
        db().select().from(config),
        CONFIG_DB_TIMEOUT_MS,
        'getConfigs()'
      );
      const configs: Configs = {};
      for (const row of rows || []) {
        configs[row.name] = row.value ?? '';
      }
      cachedDbConfigs = configs;
      cachedDbConfigsAt = Date.now();
      cachedDbConfigsErrorAt = 0;
      inflightDbConfigs = null;
      return { ...configs };
    })().catch((e) => {
      cachedDbConfigsErrorAt = Date.now();
      inflightDbConfigs = null;
      throw e;
    });
  }

  return inflightDbConfigs;
}

export async function getAllConfigs(): Promise<Configs> {
  let dbConfigs: Configs = {};

  // only get configs from db in server side
  if (envConfigs.database_url) {
    try {
      dbConfigs = await getConfigs();
    } catch (e) {
      console.log(`get configs from db failed:`, e);
      dbConfigs = {};
    }
  }

  const configs = {
    ...envConfigs,
    ...dbConfigs,
  };

  return configs;
}

export async function getPublicConfigs(): Promise<Configs> {
  let dbConfigs: Configs = {};

  // only get configs from db in server side
  if (typeof window === 'undefined' && envConfigs.database_url) {
    try {
      dbConfigs = await getConfigs();
    } catch (e) {
      console.log('get configs from db failed:', e);
      dbConfigs = {};
    }
  }

  const publicConfigs: Record<string, string> = {};

  // get public configs from db
  for (const key in dbConfigs) {
    if (publicSettingNames.includes(key)) {
      publicConfigs[key] = dbConfigs[key];
    }
  }

  const configs = {
    ...publicConfigs,
  };

  return configs;
}
