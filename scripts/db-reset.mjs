import pg from 'pg';

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/cashin';
const useSsl = process.env.DATABASE_SSL === 'true';

const client = new pg.Client({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
});

try {
  await client.connect();
  await client.query(
    'TRUNCATE ledger_entries, webhook_events, operations, wallets RESTART IDENTITY CASCADE',
  );
  await client.query(
    `INSERT INTO wallets (user_id, currency, balance_cents)
     VALUES ('usr_abc123', 'PEN', 25000)`,
  );
  console.log('[ok] BD reseteada. Wallet usr_abc123 = 250.00 PEN');
} catch (error) {
  console.error('[error]', error.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
