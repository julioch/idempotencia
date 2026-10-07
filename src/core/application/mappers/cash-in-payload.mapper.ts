import { Operation } from '../../domain/entities/operation';
import { OperationStatus } from '../../domain/value-objects/operation-status';
import { CashInResponsePayload, CashInResponseStatus } from '../dto/cash-in.dto';

export function statusToResponse(status: OperationStatus): CashInResponseStatus {
  switch (status) {
    case OperationStatus.COMPLETED:
      return 'completed';
    case OperationStatus.FAILED:
      return 'failed';
    case OperationStatus.TIMEOUT_UNKNOWN:
      return 'timeout_unknown';
    default:
      return 'pending';
  }
}

export function completedPayload(
  operation: Operation,
  providerReference: string | null,
  newBalanceCents: number,
): CashInResponsePayload {
  return {
    operation_id: operation.id,
    status: 'completed',
    amount: operation.amount.toDecimal(),
    new_balance: newBalanceCents / 100,
    provider_reference: providerReference ?? operation.providerReference,
  };
}

export function operationPayload(operation: Operation): CashInResponsePayload {
  const stored = operation.responsePayload as CashInResponsePayload | null;
  if (stored && operation.isCompleted()) {
    return stored;
  }
  return {
    operation_id: operation.id,
    status: statusToResponse(operation.status),
    amount: operation.amount.toDecimal(),
    new_balance: stored?.new_balance ?? null,
    provider_reference: operation.providerReference,
  };
}
