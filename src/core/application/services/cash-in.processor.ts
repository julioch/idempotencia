import { Operation } from '../../domain/entities/operation';
import { OperationStatus } from '../../domain/value-objects/operation-status';
import { IOperationRepository } from '../ports/operation-repository.port';
import { IUnitOfWork } from '../ports/unit-of-work.port';
import { IPaymentProvider } from '../ports/payment-provider.port';
import { IClock } from '../ports/clock.port';
import {
  CashInOutcome,
  CashInResponsePayload,
} from '../dto/cash-in.dto';
import { completedPayload, operationPayload } from '../mappers/cash-in-payload.mapper';
import { OperationInProgressError, ProviderUnavailableError } from '../errors/application.errors';

/**
 * Lógica compartida entre el alta de un cash-in y la reconciliación.
 * La llamada al proveedor NUNCA ocurre dentro de la transacción de base de datos.
 */
export class CashInProcessor {
  constructor(
    private readonly operations: IOperationRepository,
    private readonly unitOfWork: IUnitOfWork,
    private readonly paymentProvider: IPaymentProvider,
    private readonly clock: IClock,
    private readonly staleMs = 30_000,
  ) {}

  toPayload(operation: Operation): CashInResponsePayload {
    return operationPayload(operation);
  }

  async handleExisting(operation: Operation, now: Date): Promise<CashInOutcome> {
    if (operation.isCompleted()) {
      return { payload: operationPayload(operation), httpStatus: 200 };
    }
    if (operation.isFailed()) {
      return { payload: operationPayload(operation), httpStatus: 402 };
    }
    if (operation.status === OperationStatus.PENDING_GATEWAY && !this.isStale(operation, now)) {
      // Doble click / request concurrente: ya hay un procesamiento en curso.
      throw new OperationInProgressError(operation.id);
    }
    // PENDING_GATEWAY estancada (crash) o TIMEOUT_UNKNOWN -> conciliación activa.
    return this.reconcile(operation);
  }

  async charge(operation: Operation): Promise<CashInOutcome> {
    const now = this.clock.now();
    try {
      const result = await this.paymentProvider.charge({
        operationId: operation.id,
        userId: operation.userId,
        amount: operation.amount,
        paymentMethod: operation.paymentMethod,
        idempotencyKey: operation.id,
      });
      if (result.status === 'SUCCEEDED') {
        return this.complete(operation, result.providerReference, now);
      }
      return this.fail(operation, 'pago rechazado por el proveedor', now);
    } catch (error) {
      if (error instanceof ProviderUnavailableError) {
        return this.markTimeout(operation, now);
      }
      throw error;
    }
  }

  async reconcile(operation: Operation): Promise<CashInOutcome> {
    const now = this.clock.now();
    let status;
    try {
      status = await this.paymentProvider.getChargeStatus({
        providerReference: operation.providerReference,
        operationId: operation.id,
      });
    } catch (error) {
      if (error instanceof ProviderUnavailableError) {
        return this.markTimeout(operation, now);
      }
      throw error;
    }

    switch (status.status) {
      case 'SUCCEEDED':
        return this.complete(operation, status.providerReference, now);
      case 'DECLINED':
        return this.fail(operation, 'pago rechazado por el proveedor', now);
      case 'PENDING':
        return this.markTimeout(operation, now);
      case 'NOT_FOUND':
      default:
        // El proveedor no registró el cobro: recobro seguro con la misma idempotency key.
        return this.charge(operation);
    }
  }

  async complete(
    operation: Operation,
    providerReference: string | null,
    now: Date,
  ): Promise<CashInOutcome> {
    return this.unitOfWork.run(async (ctx) => {
      const credit = await ctx.wallet.applyCredit({
        userId: operation.userId,
        currency: operation.amount.currency.code,
        operationId: operation.id,
        amount: operation.amount,
      });

      if (operation.isCompleted()) {
        return { payload: operationPayload(operation), httpStatus: 200 };
      }

      const payload = completedPayload(operation, providerReference, credit.newBalanceCents);
      const updated = operation.markCompleted(payload, providerReference, now);
      await ctx.operations.save(updated);
      return { payload, httpStatus: 200 };
    });
  }

  async fail(operation: Operation, reason: string, now: Date): Promise<CashInOutcome> {
    const failed = operation.isFailed() ? operation : operation.markFailed(reason, now);
    if (!operation.isFailed()) {
      await this.operations.save(failed);
    }
    return { payload: operationPayload(failed), httpStatus: 402 };
  }

  async markTimeout(operation: Operation, now: Date): Promise<CashInOutcome> {
    if (!operation.isTimedOut()) {
      const updated = operation.markTimeoutUnknown(operation.providerReference, now);
      await this.operations.save(updated);
      return { payload: operationPayload(updated), httpStatus: 202 };
    }
    return { payload: operationPayload(operation), httpStatus: 202 };
  }

  private isStale(operation: Operation, now: Date): boolean {
    return now.getTime() - operation.updatedAt.getTime() >= this.staleMs;
  }
}
