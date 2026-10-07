import { IOperationRepository } from '../../../src/core/application/ports/operation-repository.port';
import { IWalletLedgerPort } from '../../../src/core/application/ports/wallet-ledger.port';
import { IWebhookRepository } from '../../../src/core/application/ports/webhook-repository.port';
import {
  ICashInTransactionContext,
  IUnitOfWork,
} from '../../../src/core/application/ports/unit-of-work.port';
import { IPaymentProvider } from '../../../src/core/application/ports/payment-provider.port';
import { IClock } from '../../../src/core/application/ports/clock.port';

export interface ContextMocks {
  operations: jest.Mocked<IOperationRepository>;
  wallet: jest.Mocked<IWalletLedgerPort>;
  webhooks: jest.Mocked<IWebhookRepository>;
  unitOfWork: jest.Mocked<IUnitOfWork>;
}

export function createOperationRepositoryMock(): jest.Mocked<IOperationRepository> {
  return {
    create: jest.fn(),
    save: jest.fn(),
    findById: jest.fn(),
    findByIdempotencyKey: jest.fn(),
    findStale: jest.fn(),
  } as unknown as jest.Mocked<IOperationRepository>;
}

export function createWalletLedgerMock(): jest.Mocked<IWalletLedgerPort> {
  return {
    ensureWallet: jest.fn(),
    getBalanceCents: jest.fn(),
    applyCredit: jest.fn(),
  } as unknown as jest.Mocked<IWalletLedgerPort>;
}

export function createWebhookRepositoryMock(): jest.Mocked<IWebhookRepository> {
  return {
    insert: jest.fn(),
    findByReferenceAndType: jest.fn(),
    markProcessed: jest.fn(),
  } as unknown as jest.Mocked<IWebhookRepository>;
}

export function createContextMocks(): ContextMocks {
  const operations = createOperationRepositoryMock();
  const wallet = createWalletLedgerMock();
  const webhooks = createWebhookRepositoryMock();
  const ctx: ICashInTransactionContext = { operations, wallet, webhooks };
  const unitOfWork = {
    run: jest.fn(async (work: (c: ICashInTransactionContext) => Promise<unknown>) => work(ctx)),
  } as unknown as jest.Mocked<IUnitOfWork>;
  return { operations, wallet, webhooks, unitOfWork };
}

export function createPaymentProviderMock(): jest.Mocked<IPaymentProvider> {
  return {
    charge: jest.fn(),
    getChargeStatus: jest.fn(),
  } as unknown as jest.Mocked<IPaymentProvider>;
}

export function createClockMock(date: Date): jest.Mocked<IClock> {
  return { now: jest.fn(() => date) } as unknown as jest.Mocked<IClock>;
}
