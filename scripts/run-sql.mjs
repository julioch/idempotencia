import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/cashin';
const useSsl = process.env.DATABASE_SSL === 'true';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Uso: node scripts/run-sql.mjs <archivo.sql> [...]');
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

try {
  await client.connect();
  for (const file of files) {
    const abs = resolve(process.cwd(), file);
    const sql = await readFile(abs, 'utf8');
    await client.query(sql);
    console.log(`[ok] aplicado ${file}`);
  }
} catch (error) {
  console.error('[error]', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
