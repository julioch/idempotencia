export const WebhookEventType = {
  PAYMENT_SUCCEEDED: 'payment.succeeded',
  PAYMENT_FAILED: 'payment.failed',
} as const;

export type WebhookEventType = (typeof WebhookEventType)[keyof typeof WebhookEventType];

export type WebhookProcessingStatus = 'RECEIVED' | 'PROCESSED' | 'IGNORED' | 'ORPHAN';

export interface WebhookEventSnapshot {
  id?: number;
  providerReference: string;
  eventType: string;
  operationId: string | null;
  payload: Record<string, unknown>;
  status: WebhookProcessingStatus;
  receivedAt: Date;
  processedAt: Date | null;
}

export class WebhookEvent {
  private constructor(private readonly props: WebhookEventSnapshot) {}

  static create(params: {
    providerReference: string;
    eventType: string;
    operationId: string | null;
    payload: Record<string, unknown>;
    now: Date;
  }): WebhookEvent {
    return new WebhookEvent({
      providerReference: params.providerReference,
      eventType: params.eventType,
      operationId: params.operationId,
      payload: params.payload,
      status: 'RECEIVED',
      receivedAt: params.now,
      processedAt: null,
    });
  }

  static rehydrate(props: WebhookEventSnapshot): WebhookEvent {
    return new WebhookEvent(props);
  }

  get id(): number | undefined {
    return this.props.id;
  }

  get providerReference(): string {
    return this.props.providerReference;
  }

  get eventType(): string {
    return this.props.eventType;
  }

  get operationId(): string | null {
    return this.props.operationId;
  }

  get payload(): Record<string, unknown> {
    return this.props.payload;
  }

  get status(): WebhookProcessingStatus {
    return this.props.status;
  }

  get receivedAt(): Date {
    return this.props.receivedAt;
  }

  get processedAt(): Date | null {
    return this.props.processedAt;
  }

  withId(id: number): WebhookEvent {
    return new WebhookEvent({ ...this.props, id });
  }

  markProcessed(status: WebhookProcessingStatus, now: Date): WebhookEvent {
    return new WebhookEvent({ ...this.props, status, processedAt: now });
  }
}
