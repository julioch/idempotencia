import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Pool } from 'pg';

export function createPool(): Pool {
  const useSsl = process.env.DATABASE_SSL === 'true';
  return new Pool({
    connectionString:
      process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/cashin',
    ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  });
}

export async function applySchema(pool: Pool): Promise<void> {
  const sql = readFileSync(join(process.cwd(), 'db', '001_schema.sql'), 'utf8');
  await pool.query(sql);
}

export async function truncateAll(pool: Pool): Promise<void> {
  await pool.query(
    'TRUNCATE ledger_entries, webhook_events, operations, wallets RESTART IDENTITY CASCADE',
  );
}

export async function seedWallet(
  pool: Pool,
  userId = 'usr_abc123',
  currency = 'PEN',
  balanceCents = 25_000,
): Promise<void> {
  await pool.query(
    `INSERT INTO wallets (user_id, currency, balance_cents)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, currency) DO UPDATE SET balance_cents = EXCLUDED.balance_cents`,
    [userId, currency, balanceCents],
  );
}

export async function getBalanceCents(
  pool: Pool,
  userId = 'usr_abc123',
  currency = 'PEN',
): Promise<number> {
  const result = await pool.query<{ balance_cents: string }>(
    'SELECT balance_cents FROM wallets WHERE user_id = $1 AND currency = $2',
    [userId, currency],
  );
  return Number(result.rows[0].balance_cents);
}
