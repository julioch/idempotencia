import { IOperationRepository } from './operation-repository.port';
import { IWalletLedgerPort } from './wallet-ledger.port';
import { IWebhookRepository } from './webhook-repository.port';

/** Repositorios ligados a la transacción en curso (mismo client de PostgreSQL). */
export interface ICashInTransactionContext {
  operations: IOperationRepository;
  wallet: IWalletLedgerPort;
  webhooks: IWebhookRepository;
}

export interface IUnitOfWork {
  /** Abre BEGIN, ejecuta el trabajo y hace COMMIT/ROLLBACK. No debe contener llamadas HTTP. */
  run<T>(work: (ctx: ICashInTransactionContext) => Promise<T>): Promise<T>;
}
