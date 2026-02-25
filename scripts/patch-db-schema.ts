import { sql } from 'drizzle-orm';

import { db, closeDb } from '@/core/db';

async function main() {
  // Keep this script intentionally tiny and idempotent.
  // This repo currently relies on `drizzle-kit push`, but some environments
  // (e.g. managed Postgres) can hit drizzle-kit introspection bugs.
  //
  // When that happens, patch the schema with minimal SQL so the app + tests run.
  await db().execute(
    sql.raw('ALTER TABLE "credit" ADD COLUMN IF NOT EXISTS "available_at" timestamp;')
  );

  await closeDb();
  // eslint-disable-next-line no-console
  console.log('Schema patch applied: credit.available_at');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

