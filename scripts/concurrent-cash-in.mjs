import { randomUUID } from 'node:crypto';
import pg from 'pg';

/**
 * Dispara N requests POST /cash-in en paralelo para evidenciar:
 *  - modo "same":     escenario 3 (varios pods, misma Idempotency-Key)
 *  - modo "distinct": escenario 10 (race condition sobre el saldo)
 *
 * Uso:
 *   node scripts/concurrent-cash-in.mjs [baseUrl] [n] [same|distinct]
 *   node scripts/concurrent-cash-in.mjs http://localhost:3000 10 same
 */
const baseUrl = process.argv[2] ?? process.env.BASE_URL ?? 'http://localhost:3000';
const count = Number(process.argv[3] ?? 10);
const mode = (process.argv[4] ?? 'distinct').toLowerCase();
const userId = process.env.USER_ID ?? 'usr_abc123';
const amount = Number(process.env.AMOUNT ?? 100);
const currency = process.env.CURRENCY ?? 'PEN';
const fixedKey = process.env.IDEMPOTENCY_KEY ?? randomUUID();

if (!['same', 'distinct'].includes(mode)) {
  console.error("Modo inválido. Usa 'same' o 'distinct'.");
  process.exit(1);
}

const fire = async () => {
  const idempotencyKey = mode === 'same' ? fixedKey : randomUUID();
  try {
    const response = await fetch(`${baseUrl}/cash-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({
        user_id: userId,
        amount,
        currency,
        payment_method: 'card_xyz',
      }),
    });
    const body = await response.json().catch(() => null);
    return { status: response.status, body };
  } catch (error) {
    return { status: 'ERR', error: error.message };
  }
};

console.log(`Disparando ${count} requests concurrentes (modo=${mode}) a ${baseUrl} ...`);
const results = await Promise.all(Array.from({ length: count }, fire));

const byStatus = results.reduce((acc, r) => {
  const key = String(r.status);
  acc[key] = (acc[key] ?? 0) + 1;
  return acc;
}, {});
console.log('Estados HTTP:', byStatus);

const operationIds = [...new Set(results.map((r) => r.body?.operation_id).filter(Boolean))];
console.log(`operation_id distintos: ${operationIds.length}`);

const balances = [...new Set(results.map((r) => r.body?.new_balance).filter((v) => v != null))];
console.log('new_balance vistos:', balances);

const connectionString =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/cashin';
const pool = new pg.Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

try {
  const wallet = await pool.query(
    'SELECT balance_cents FROM wallets WHERE user_id = $1 AND currency = $2',
    [userId, currency],
  );
  const ledger = await pool.query('SELECT COUNT(*)::int AS c FROM ledger_entries');
  const operations = await pool.query(
    'SELECT status, COUNT(*)::int AS c FROM operations GROUP BY status ORDER BY status',
  );

  console.log('--- Estado en base de datos ---');
  console.log('Saldo actual (centavos):', wallet.rows[0]?.balance_cents ?? null);
  console.log('ledger_entries:', ledger.rows[0].c);
  console.log('operations por estado:', operations.rows);

  if (mode === 'same') {
    console.log('Esperado: 1 operation_id distinto y 1 sola fila en ledger_entries.');
  } else {
    console.log(
      `Esperado: saldo = inicial + ${count} * ${amount * 100} centavos (sin actualizaciones perdidas).`,
    );
  }
} finally {
  await pool.end();
}
