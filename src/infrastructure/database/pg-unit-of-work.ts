import { Pool } from 'pg';
import {
  ICashInTransactionContext,
  IUnitOfWork,
} from '../../core/application/ports/unit-of-work.port';
import { PgOperationRepository } from '../persistence/pg-operation.repository';
import { PgWalletLedgerRepository } from '../persistence/pg-wallet-ledger.repository';
import { PgWebhookRepository } from '../persistence/pg-webhook.repository';
import { RetryPolicy } from './retry.policy';

export class PgUnitOfWork implements IUnitOfWork {
  constructor(
    private readonly pool: Pool,
    private readonly retryPolicy: RetryPolicy,
  ) {}

  async run<T>(work: (ctx: ICashInTransactionContext) => Promise<T>): Promise<T> {
    return this.retryPolicy.execute(async () => {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const ctx: ICashInTransactionContext = {
          operations: new PgOperationRepository(client),
          wallet: new PgWalletLedgerRepository(client),
          webhooks: new PgWebhookRepository(client),
        };
        const result = await work(ctx);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Si el ROLLBACK también falla, la conexión se descarta al liberarla.
        }
        throw error;
      } finally {
        client.release();
      }
    });
  }
}
