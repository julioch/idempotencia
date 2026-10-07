import { Pool } from 'pg';
import { Operation } from '../../src/core/domain/entities/operation';
import { Money } from '../../src/core/domain/value-objects/money';
import { WebhookEventType } from '../../src/core/domain/entities/webhook-event';
import { HandlePaymentWebhookUseCase } from '../../src/core/application/use-cases/handle-payment-webhook.use-case';
import { PgOperationRepository } from '../../src/infrastructure/persistence/pg-operation.repository';
import { PgWebhookRepository } from '../../src/infrastructure/persistence/pg-webhook.repository';
import { PgUnitOfWork } from '../../src/infrastructure/database/pg-unit-of-work';
import { RetryPolicy } from '../../src/infrastructure/database/retry.policy';
import { SystemClock } from '../../src/infrastructure/clock/system-clock';
import { applySchema, createPool, getBalanceCents, seedWallet, truncateAll } from './helpers/db';

describe('Webhooks idempotentes (PostgreSQL real)', () => {
  let pool: Pool;
  let useCase: HandlePaymentWebhookUseCase;
  let operations: PgOperationRepository;

  beforeAll(async () => {
    pool = createPool();
    await applySchema(pool);
  });

  beforeEach(async () => {
    await truncateAll(pool);
    await seedWallet(pool, 'usr_abc123', 'PEN', 25_000);

    operations = new PgOperationRepository(pool);
    const unitOfWork = new PgUnitOfWork(pool, new RetryPolicy(3, 1));
    const webhooks = new PgWebhookRepository(pool);
    useCase = new HandlePaymentWebhookUseCase(operations, unitOfWork, webhooks, new SystemClock());
  });

  afterAll(async () => {
    await pool.end();
  });

  it('webhook duplicado acredita el saldo una sola vez', async () => {
    const operation = Operation.create({
      userId: 'usr_abc123',
      idempotencyKey: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      amount: Money.fromDecimal(100, 'PEN'),
      paymentMethod: 'card_xyz',
      now: new Date(),
    });
    await operations.create(operation);

    const command = {
      providerReference: 'ref_ext_999',
      operationId: operation.id,
      eventType: WebhookEventType.PAYMENT_SUCCEEDED,
      timestamp: new Date().toISOString(),
      raw: { event_type: WebhookEventType.PAYMENT_SUCCEEDED },
    };

    const first = await useCase.execute(command);
    const second = await useCase.execute(command);

    expect(first.processed).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(await getBalanceCents(pool)).toBe(35_000);

    const ledger = await pool.query('SELECT COUNT(*)::int AS count FROM ledger_entries');
    expect(ledger.rows[0].count).toBe(1);
  });
});
