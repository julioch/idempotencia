import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OperationStatus } from '../../core/domain/value-objects/operation-status';
import { IOperationRepository } from '../../core/application/ports/operation-repository.port';
import { TOKENS } from '../../core/application/ports/tokens';
import { ReconcileOperationUseCase } from '../../core/application/use-cases/reconcile-operation.use-case';

@Injectable()
export class ReconciliationJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReconciliationJob.name);
  private handle?: NodeJS.Timeout;

  constructor(
    @Inject(TOKENS.OPERATION_REPOSITORY)
    private readonly operations: IOperationRepository,
    private readonly reconcile: ReconcileOperationUseCase,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (!this.config.get<boolean>('RECONCILER_ENABLED')) {
      this.logger.log('Reconciliador deshabilitado');
      return;
    }
    const intervalMs = Number(this.config.get<number>('RECONCILER_INTERVAL_MS', 60_000));
    this.handle = setInterval(() => {
      void this.run();
    }, intervalMs);
    this.handle.unref?.();
    this.logger.log(`Reconciliador activo cada ${intervalMs} ms`);
  }

  onModuleDestroy(): void {
    if (this.handle) {
      clearInterval(this.handle);
    }
  }

  async run(): Promise<void> {
    const staleMs = Number(this.config.get<number>('RECONCILER_STALE_MS', 30_000));
    const olderThan = new Date(Date.now() - staleMs);
    const stale = await this.operations.findStale(
      [OperationStatus.TIMEOUT_UNKNOWN, OperationStatus.PENDING_GATEWAY],
      olderThan,
      50,
    );

    for (const operation of stale) {
      try {
        await this.reconcile.execute(operation.id);
      } catch (error) {
        this.logger.error(
          `Fallo al reconciliar ${operation.id}: ${(error as Error).message}`,
        );
      }
    }
  }
}
