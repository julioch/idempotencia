export type CashInResponseStatus = 'completed' | 'failed' | 'timeout_unknown' | 'pending';

export interface CashInResponsePayload extends Record<string, unknown> {
  operation_id: string;
  status: CashInResponseStatus;
  amount: number;
  new_balance: number | null;
  provider_reference: string | null;
}

export interface CashInOutcome {
  payload: CashInResponsePayload;
  httpStatus: number;
}

export interface InitiateCashInCommand {
  userId: string;
  amount: number;
  currency: string;
  paymentMethod: string;
  idempotencyKey: string;
}

export interface PaymentWebhookCommand {
  providerReference: string;
  operationId: string | null;
  eventType: string;
  timestamp: string;
  raw: Record<string, unknown>;
}

export interface WebhookOutcome {
  processed: boolean;
  duplicate: boolean;
  ignored: boolean;
  orphan: boolean;
}
