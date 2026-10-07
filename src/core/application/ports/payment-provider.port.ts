import { Money } from '../../domain/value-objects/money';

export interface ChargeRequest {
  operationId: string;
  userId: string;
  amount: Money;
  paymentMethod: string;
  /** Clave de idempotencia enviada al proveedor (= operation_id) para evitar doble cobro. */
  idempotencyKey: string;
}

export type ChargeOutcome = 'SUCCEEDED' | 'DECLINED';

export interface ChargeResult {
  providerReference: string;
  status: ChargeOutcome;
  raw?: Record<string, unknown>;
}

export type ChargeQueryStatus = 'SUCCEEDED' | 'DECLINED' | 'PENDING' | 'NOT_FOUND';

export interface ChargeStatusResult {
  status: ChargeQueryStatus;
  providerReference: string | null;
  raw?: Record<string, unknown>;
}

export interface ChargeStatusQuery {
  /** Presente cuando ya conocemos la referencia externa (GET /charges/:id). */
  providerReference?: string | null;
  /** Siempre presente: permite conciliar por clave de idempotencia. */
  operationId: string;
}

export interface IPaymentProvider {
  charge(request: ChargeRequest): Promise<ChargeResult>;
  getChargeStatus(query: ChargeStatusQuery): Promise<ChargeStatusResult>;
}
