export const TOKENS = {
  PG_POOL: Symbol('PG_POOL'),
  OPERATION_REPOSITORY: Symbol('IOperationRepository'),
  WALLET_LEDGER: Symbol('IWalletLedgerPort'),
  WEBHOOK_REPOSITORY: Symbol('IWebhookRepository'),
  UNIT_OF_WORK: Symbol('IUnitOfWork'),
  PAYMENT_PROVIDER: Symbol('IPaymentProvider'),
  CLOCK: Symbol('IClock'),
} as const;
