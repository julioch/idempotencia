import {
  WebhookEvent,
  WebhookEventType,
  WebhookProcessingStatus,
} from '../../domain/entities/webhook-event';
import { IOperationRepository } from '../ports/operation-repository.port';
import { IWebhookRepository } from '../ports/webhook-repository.port';
import { IUnitOfWork } from '../ports/unit-of-work.port';
import { IClock } from '../ports/clock.port';
import { PaymentWebhookCommand, WebhookOutcome } from '../dto/cash-in.dto';
import { completedPayload } from '../mappers/cash-in-payload.mapper';
import { DuplicateKeyError } from '../errors/application.errors';

export class HandlePaymentWebhookUseCase {
  constructor(
    private readonly operations: IOperationRepository,
    private readonly unitOfWork: IUnitOfWork,
    private readonly webhooks: IWebhookRepository,
    private readonly clock: IClock,
  ) {}

  async execute(command: PaymentWebhookCommand): Promise<WebhookOutcome> {
    const now = this.clock.now();
    const event = WebhookEvent.create({
      providerReference: command.providerReference,
      eventType: command.eventType,
      operationId: command.operationId,
      payload: command.raw,
      now,
    });

    let stored: WebhookEvent;
    try {
      // Deduplicación durable: UNIQUE(provider_reference, event_type).
      stored = await this.webhooks.insert(event);
    } catch (error) {
      if (!(error instanceof DuplicateKeyError)) {
        throw error;
      }
      const existing = await this.webhooks.findByReferenceAndType(
        command.providerReference,
        command.eventType,
      );
      if (!existing) {
        throw error;
      }
      if (existing.status === 'PROCESSED') {
        return this.outcome({ duplicate: true });
      }
      if (existing.status === 'IGNORED') {
        return this.outcome({ duplicate: true, ignored: true });
      }
      if (existing.status === 'ORPHAN') {
        return this.outcome({ duplicate: true, orphan: true });
      }
      stored = existing;
    }

    if (!command.operationId) {
      await this.mark(stored, 'ORPHAN', now);
      return this.outcome({ orphan: true });
    }

    const operation = await this.operations.findById(command.operationId);
    if (!operation) {
      await this.mark(stored, 'ORPHAN', now);
      return this.outcome({ orphan: true });
    }

    // Un evento de fallo recibido después de COMPLETED no regresa el estado.
    if (operation.isCompleted()) {
      await this.mark(stored, 'IGNORED', now);
      return this.outcome({ ignored: true });
    }

    if (command.eventType === WebhookEventType.PAYMENT_SUCCEEDED) {
      await this.unitOfWork.run(async (ctx) => {
        const credit = await ctx.wallet.applyCredit({
          userId: operation.userId,
          currency: operation.amount.currency.code,
          operationId: operation.id,
          amount: operation.amount,
        });
        if (!operation.isCompleted()) {
          const payload = completedPayload(operation, command.providerReference, credit.newBalanceCents);
          await ctx.operations.save(
            operation.markCompleted(payload, command.providerReference, now),
          );
        }
      });
      await this.mark(stored, 'PROCESSED', now);
      return this.outcome({ processed: true });
    }

    if (operation.isFailed()) {
      await this.mark(stored, 'IGNORED', now);
      return this.outcome({ ignored: true });
    }

    await this.operations.save(operation.markFailed('el proveedor reportó un fallo', now));
    await this.mark(stored, 'PROCESSED', now);
    return this.outcome({ processed: true });
  }

  private async mark(
    event: WebhookEvent,
    status: WebhookProcessingStatus,
    now: Date,
  ): Promise<void> {
    if (event.id === undefined) {
      return;
    }
    await this.webhooks.markProcessed(event.id, status, now);
  }

  private outcome(partial: Partial<WebhookOutcome>): WebhookOutcome {
    return { processed: false, duplicate: false, ignored: false, orphan: false, ...partial };
  }
}
