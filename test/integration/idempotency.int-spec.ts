import { Pool } from 'pg';
import { Operation } from '../../src/core/domain/entities/operation';
import { Money } from '../../src/core/domain/value-objects/money';
import { DuplicateKeyError } from '../../src/core/application/errors/application.errors';
import { PgOperationRepository } from '../../src/infrastructure/persistence/pg-operation.repository';
import { applySchema, createPool, truncateAll } from './helpers/db';

const KEY = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

function buildOperation(userId: string, idempotencyKey = KEY): Operation {
  return Operation.create({
    userId,
    idempotencyKey,
    amount: Money.fromDecimal(100, 'PEN'),
    paymentMethod: 'card_xyz',
    now: new Date(),
  });
}

describe('Idempotencia durable (PostgreSQL real)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = createPool();
    await applySchema(pool);
  });

  beforeEach(async () => {
    await truncateAll(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('UNIQUE(user_id, idempotency_key) lanza DuplicateKeyError (23505)', async () => {
    const repo = new PgOperationRepository(pool);
    await repo.create(buildOperation('usr_1'));

    await expect(repo.create(buildOperation('usr_1'))).rejects.toBeInstanceOf(DuplicateKeyError);
  });

  it('múltiples pods concurrentes: solo una inserción gana', async () => {
    const repo = new PgOperationRepository(pool);
    const attempts = Array.from({ length: 8 }, () => repo.create(buildOperation('usr_2')));

    const results = await Promise.allSettled(attempts);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');

    expect(fulfilled).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(7);
  });

  it('la misma key con distinto usuario se permite', async () => {
    const repo = new PgOperationRepository(pool);
    await repo.create(buildOperation('usr_a'));
    await expect(repo.create(buildOperation('usr_b'))).resolves.toBeUndefined();
  });
});
