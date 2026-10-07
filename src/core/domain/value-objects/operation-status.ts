import { InvalidStateTransitionError } from '../exceptions/domain.exception';

export type OperationStatus = 'PENDING_GATEWAY' | 'TIMEOUT_UNKNOWN' | 'COMPLETED' | 'FAILED';

export const OperationStatus = {
  PENDING_GATEWAY: 'PENDING_GATEWAY',
  TIMEOUT_UNKNOWN: 'TIMEOUT_UNKNOWN',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
} as const;

/**
 * Transiciones permitidas de la máquina de estados.
 * - Un timeout del proveedor NUNCA lleva a FAILED (siempre TIMEOUT_UNKNOWN).
 * - FAILED puede pasar a COMPLETED por un webhook de éxito: el dinero ya se movió
 *   en la pasarela y esta es la fuente de verdad.
 */
export const ALLOWED_TRANSITIONS: Record<OperationStatus, OperationStatus[]> = {
  PENDING_GATEWAY: ['COMPLETED', 'FAILED', 'TIMEOUT_UNKNOWN'],
  TIMEOUT_UNKNOWN: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: ['COMPLETED'],
};

export function isTerminal(status: OperationStatus): boolean {
  return status === OperationStatus.COMPLETED || status === OperationStatus.FAILED;
}

export function canTransition(from: OperationStatus, to: OperationStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: OperationStatus, to: OperationStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to);
  }
}
