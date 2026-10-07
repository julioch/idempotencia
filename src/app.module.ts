import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { Pool } from 'pg';

import { TOKENS } from './core/application/ports/tokens';
import { IOperationRepository } from './core/application/ports/operation-repository.port';
import { IPaymentProvider } from './core/application/ports/payment-provider.port';
import { IUnitOfWork } from './core/application/ports/unit-of-work.port';
import { IWebhookRepository } from './core/application/ports/webhook-repository.port';
import { IClock } from './core/application/ports/clock.port';
import { CashInProcessor } from './core/application/services/cash-in.processor';
import { InitiateCashInUseCase } from './core/application/use-cases/initiate-cash-in.use-case';
import { ReconcileOperationUseCase } from './core/application/use-cases/reconcile-operation.use-case';
import { HandlePaymentWebhookUseCase } from './core/application/use-cases/handle-payment-webhook.use-case';

import { validateEnv, FakeProviderMode } from './infrastructure/config/env.validation';
import { createPgPool } from './infrastructure/database/pg-pool.provider';
import { PgUnitOfWork } from './infrastructure/database/pg-unit-of-work';
import { RetryPolicy } from './infrastructure/database/retry.policy';
import { PgOperationRepository } from './infrastructure/persistence/pg-operation.repository';
import { PgWalletLedgerRepository } from './infrastructure/persistence/pg-wallet-ledger.repository';
import { PgWebhookRepository } from './infrastructure/persistence/pg-webhook.repository';
import { FakePaymentProvider } from './infrastructure/payment/fake-payment.provider';
import { SystemClock } from './infrastructure/clock/system-clock';
import { ReconciliationJob } from './infrastructure/scheduler/reconciliation.job';

import { CashInController } from './interfaces/http/controllers/cash-in.controller';
import { PaymentWebhookController } from './interfaces/http/controllers/payment-webhook.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    ScheduleModule.forRoot(),
  ],
  controllers: [CashInController, PaymentWebhookController],
  providers: [
    {
      provide: TOKENS.PG_POOL,
      useFactory: (config: ConfigService) => createPgPool(config),
      inject: [ConfigService],
    },
    {
      provide: TOKENS.OPERATION_REPOSITORY,
      useFactory: (pool: Pool) => new PgOperationRepository(pool),
      inject: [TOKENS.PG_POOL],
    },
    {
      provide: TOKENS.WALLET_LEDGER,
      useFactory: (pool: Pool) => new PgWalletLedgerRepository(pool),
      inject: [TOKENS.PG_POOL],
    },
    {
      provide: TOKENS.WEBHOOK_REPOSITORY,
      useFactory: (pool: Pool) => new PgWebhookRepository(pool),
      inject: [TOKENS.PG_POOL],
    },
    {
      provide: RetryPolicy,
      useFactory: (config: ConfigService) =>
        new RetryPolicy(
          Number(config.get('DB_RETRY_MAX_ATTEMPTS', 3)),
          Number(config.get('DB_RETRY_BASE_DELAY_MS', 50)),
        ),
      inject: [ConfigService],
    },
    {
      provide: TOKENS.UNIT_OF_WORK,
      useFactory: (pool: Pool, retry: RetryPolicy) => new PgUnitOfWork(pool, retry),
      inject: [TOKENS.PG_POOL, RetryPolicy],
    },
    {
      provide: TOKENS.PAYMENT_PROVIDER,
      useFactory: (config: ConfigService) =>
        new FakePaymentProvider(
          config.get<FakeProviderMode>('FAKE_PROVIDER_MODE', 'success'),
          Number(config.get('FAKE_PROVIDER_TIMEOUT_MS', 0)),
        ),
      inject: [ConfigService],
    },
    {
      provide: TOKENS.CLOCK,
      useClass: SystemClock,
    },
    {
      provide: CashInProcessor,
      useFactory: (
        operations: IOperationRepository,
        unitOfWork: IUnitOfWork,
        provider: IPaymentProvider,
        clock: IClock,
        config: ConfigService,
      ) =>
        new CashInProcessor(
          operations,
          unitOfWork,
          provider,
          clock,
          Number(config.get('RECONCILER_STALE_MS', 30_000)),
        ),
      inject: [
        TOKENS.OPERATION_REPOSITORY,
        TOKENS.UNIT_OF_WORK,
        TOKENS.PAYMENT_PROVIDER,
        TOKENS.CLOCK,
        ConfigService,
      ],
    },
    {
      provide: InitiateCashInUseCase,
      useFactory: (operations: IOperationRepository, processor: CashInProcessor, clock: IClock) =>
        new InitiateCashInUseCase(operations, processor, clock),
      inject: [TOKENS.OPERATION_REPOSITORY, CashInProcessor, TOKENS.CLOCK],
    },
    {
      provide: ReconcileOperationUseCase,
      useFactory: (operations: IOperationRepository, processor: CashInProcessor) =>
        new ReconcileOperationUseCase(operations, processor),
      inject: [TOKENS.OPERATION_REPOSITORY, CashInProcessor],
    },
    {
      provide: HandlePaymentWebhookUseCase,
      useFactory: (
        operations: IOperationRepository,
        unitOfWork: IUnitOfWork,
        webhooks: IWebhookRepository,
        clock: IClock,
      ) => new HandlePaymentWebhookUseCase(operations, unitOfWork, webhooks, clock),
      inject: [
        TOKENS.OPERATION_REPOSITORY,
        TOKENS.UNIT_OF_WORK,
        TOKENS.WEBHOOK_REPOSITORY,
        TOKENS.CLOCK,
      ],
    },
    ReconciliationJob,
  ],
})
export class AppModule {}
