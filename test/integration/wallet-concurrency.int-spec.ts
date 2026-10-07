import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { Operation } from '../../src/core/domain/entities/operation';
import { Money } from '../../src/core/domain/value-objects/money';
import { PgOperationRepository } from '../../src/infrastructure/persistence/pg-operation.repository';
import { PgWalletLedgerRepository } from '../../src/infrastructure/persistence/pg-wallet-ledger.repository';
import { applySchema, createPool, getBalanceCents, seedWallet, truncateAll } from './helpers/db';

async function insertOperation(pool: Pool, id: string): Promise<void> {
  const repo = new PgOperationRepository(pool);
  await repo.create(
    Operation.create({
      userId: 'usr_abc123',
      idempotencyKey: randomUUID(),
      amount: Money.fromCents(10_000, 'PEN'),
      paymentMethod: 'card_xyz',
      now: new Date(),
      id,
    }),
  );
}

async function credit(
  pool: Pool,
  operationId: string,
  amountCents: number,
): Promise<{ newBalanceCents: number; alreadyApplied: boolean }> {
  const client: PoolClient = await pool.connect();
  try {
    await client.query('BEGIN');
    const repo = new PgWalletLedgerRepository(client);
    const result = await repo.applyCredit({
      userId: 'usr_abc123',
      currency: 'PEN',
      operationId,
      amount: Money.fromCents(amountCents, 'PEN'),
    });
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

describe('Concurrencia de saldo con SELECT ... FOR UPDATE', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createPool();
    await applySchema(pool);
  });

  beforeEach(async () => {
    await truncateAll(pool);
    await seedWallet(pool, 'usr_abc123', 'PEN', 25_000);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('créditos concurrentes de operaciones distintas no pierden actualizaciones', async () => {
    const operations = Array.from({ length: 10 }, (_, i) => `op_conc_${i}`);
    for (const id of operations) {
      await insertOperation(pool, id);
    }
    await Promise.all(operations.map((id) => credit(pool, id, 10_000)));

    expect(await getBalanceCents(pool)).toBe(25_000 + 10 * 10_000);
  });

  it('la misma operación concurrente acredita una sola vez (ledger único)', async () => {
    await insertOperation(pool, 'op_same');
    const results = await Promise.all(
      Array.from({ length: 5 }, () => credit(pool, 'op_same', 10_000)),
    );

    expect(await getBalanceCents(pool)).toBe(35_000);
    expect(results.filter((r) => !r.alreadyApplied)).toHaveLength(1);
    expect(results.filter((r) => r.alreadyApplied)).toHaveLength(4);
  });
});
