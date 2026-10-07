import {
  WebhookEvent,
  WebhookProcessingStatus,
} from '../../core/domain/entities/webhook-event';
import { IWebhookRepository } from '../../core/application/ports/webhook-repository.port';
import { DuplicateKeyError } from '../../core/application/errors/application.errors';
import { Queryable } from '../database/types';
import { isUniqueViolation } from './pg-errors';

interface WebhookRow {
  id: number;
  provider_reference: string;
  event_type: string;
  operation_id: string | null;
  payload: Record<string, unknown>;
  status: WebhookProcessingStatus;
  received_at: Date;
  processed_at: Date | null;
}

function toDomain(row: WebhookRow): WebhookEvent {
  return WebhookEvent.rehydrate({
    id: row.id,
    providerReference: row.provider_reference,
    eventType: row.event_type,
    operationId: row.operation_id,
    payload: row.payload,
    status: row.status,
    receivedAt: new Date(row.received_at),
    processedAt: row.processed_at ? new Date(row.processed_at) : null,
  });
}

export class PgWebhookRepository implements IWebhookRepository {
  constructor(private readonly db: Queryable) {}

  async insert(event: WebhookEvent): Promise<WebhookEvent> {
    try {
      const result = await this.db.query<{ id: number }>(
        `INSERT INTO webhook_events (
           provider_reference, event_type, operation_id, payload, status, received_at
         ) VALUES ($1, $2, $3, $4::jsonb, $5, $6)
         ON CONFLICT (provider_reference, event_type) DO NOTHING
         RETURNING id`,
        [
          event.providerReference,
          event.eventType,
          event.operationId,
          JSON.stringify(event.payload),
          event.status,
          event.receivedAt,
        ],
      );
      if (result.rowCount === 0) {
        throw new DuplicateKeyError('webhook duplicado');
      }
      return event.withId(result.rows[0].id);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateKeyError('webhook duplicado', error.constraint);
      }
      throw error;
    }
  }

  async findByReferenceAndType(
    providerReference: string,
    eventType: string,
  ): Promise<WebhookEvent | null> {
    const result = await this.db.query<WebhookRow>(
      `SELECT id, provider_reference, event_type, operation_id, payload, status, received_at, processed_at
       FROM webhook_events
       WHERE provider_reference = $1 AND event_type = $2`,
      [providerReference, eventType],
    );
    const row = result.rows[0];
    return row ? toDomain(row) : null;
  }

  async markProcessed(id: number, status: WebhookProcessingStatus, now: Date): Promise<void> {
    await this.db.query(
      `UPDATE webhook_events SET status = $2, processed_at = $3 WHERE id = $1`,
      [id, status, now],
    );
  }
}
