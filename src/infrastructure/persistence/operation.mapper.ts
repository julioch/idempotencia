import { Operation } from '../../core/domain/entities/operation';
import { Money } from '../../core/domain/value-objects/money';
import { OperationStatus } from '../../core/domain/value-objects/operation-status';

export interface OperationRow {
  id: string;
  user_id: string;
  idempotency_key: string;
  amount_cents: string | number;
  currency: string;
  payment_method: string;
  status: string;
  provider_reference: string | null;
  response_payload: Record<string, unknown> | null;
  failure_reason: string | null;
  retry_count: number;
  created_at: Date;
  updated_at: Date;
  completed_at: Date | null;
}

export function toDomainOperation(row: OperationRow): Operation {
  return Operation.rehydrate({
    id: row.id,
    userId: row.user_id,
    idempotencyKey: row.idempotency_key,
    amount: Money.fromCents(Number(row.amount_cents), row.currency),
    paymentMethod: row.payment_method,
    status: row.status as OperationStatus,
    providerReference: row.provider_reference,
    responsePayload: row.response_payload,
    failureReason: row.failure_reason,
    retryCount: row.retry_count,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
  });
}
