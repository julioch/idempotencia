import { WebhookEvent, WebhookProcessingStatus } from '../../domain/entities/webhook-event';

export interface IWebhookRepository {
  /** INSERT. Lanza DuplicateKeyError ante UNIQUE(provider_reference, event_type). */
  insert(event: WebhookEvent): Promise<WebhookEvent>;

  findByReferenceAndType(
    providerReference: string,
    eventType: string,
  ): Promise<WebhookEvent | null>;

  markProcessed(id: number, status: WebhookProcessingStatus, now: Date): Promise<void>;
}
