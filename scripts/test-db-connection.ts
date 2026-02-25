import assert from 'node:assert/strict';

// Ensure .env is loaded when running via tsx/node (see src/config/index.ts)
import '../src/config';

import { sql } from 'drizzle-orm';

import { closeDb, db } from '../src/core/db';

function asRows(result: any): any[] {
  if (!result) return [];
  if (Array.isArray(result)) return result;
  if (Array.isArray(result.rows)) return result.rows;
  return [];
}

async function main() {
  const d = db();

  // Basic connectivity.
  const ping = asRows(await d.execute(sql.raw('SELECT 1 AS ok;')));
  assert.equal(ping?.[0]?.ok, 1, 'db ping failed');

  // Schema sanity: do not touch user tables; just verify expected tables exist.
  const tables = asRows(
    await d.execute(
      sql.raw(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
      )
    )
  ).map((r) => String(r.table_name));

  for (const name of [
    'user',
    'session',
    'account',
    'config',
    'vt_system_config',
    'vt_file_original',
    'vt_task_main',
  ]) {
    assert.ok(tables.includes(name), `missing table: ${name}`);
  }

  // Write permission smoke test using a TEMP table (no persistent side effects).
  await d.execute(sql.raw('CREATE TEMP TABLE __revoice_db_test(id int);'));
  await d.execute(sql.raw('INSERT INTO __revoice_db_test(id) VALUES (1), (2);'));
  const cnt = asRows(
    await d.execute(sql.raw('SELECT COUNT(*)::int AS cnt FROM __revoice_db_test;'))
  );
  assert.equal(cnt?.[0]?.cnt, 2, 'temp table write/read failed');

  await closeDb();
  // eslint-disable-next-line no-console
  console.log('db connection + schema sanity: ok');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exitCode = 1;
});

