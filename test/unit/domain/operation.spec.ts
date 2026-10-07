import { Operation } from '../../../src/core/domain/entities/operation';
import { Money } from '../../../src/core/domain/value-objects/money';
import { OperationStatus } from '../../../src/core/domain/value-objects/operation-status';
import {
  InvalidIdempotencyKeyError,
  InvalidMoneyError,
  InvalidStateTransitionError,
} from '../../../src/core/domain/exceptions/domain.exception';

const NOW = new Date('2026-10-06T22:00:00.000Z');
const KEY = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

function newOperation() {
  return Operation.create({
    userId: 'usr_abc123',
    idempotencyKey: KEY,
    amount: Money.fromDecimal(100, 'PEN'),
    paymentMethod: 'card_xyz',
    now: NOW,
  });
}

describe('Operation (máquina de estados)', () => {
  it('nace en PENDING_GATEWAY sin referencia de proveedor', () => {
    const op = newOperation();
    expect(op.status).toBe(OperationStatus.PENDING_GATEWAY);
    expect(op.providerReference).toBeNull();
    expect(op.id.startsWith('op_')).toBe(true);
  });

  it('rechaza monto no positivo', () => {
    expect(() =>
      Operation.create({
        userId: 'usr_abc123',
        idempotencyKey: KEY,
        amount: Money.fromCents(0, 'PEN'),
        paymentMethod: 'card_xyz',
        now: NOW,
      }),
    ).toThrow(InvalidMoneyError);
  });

  it('rechaza Idempotency-Key que no sea UUID', () => {
    expect(() =>
      Operation.create({
        userId: 'usr_abc123',
        idempotencyKey: 'no-es-uuid',
        amount: Money.fromDecimal(10, 'PEN'),
        paymentMethod: 'card_xyz',
        now: NOW,
      }),
    ).toThrow(InvalidIdempotencyKeyError);
  });

  it('PENDING_GATEWAY -> TIMEOUT_UNKNOWN (nunca FAILED por timeout)', () => {
    const op = newOperation().markTimeoutUnknown(null, NOW);
    expect(op.status).toBe(OperationStatus.TIMEOUT_UNKNOWN);
    expect(op.isTerminal()).toBe(false);
  });

  it('TIMEOUT_UNKNOWN -> COMPLETED al reconciliar con éxito', () => {
    const op = newOperation()
      .markTimeoutUnknown(null, NOW)
      .markCompleted({ operation_id: 'op_x' }, 'ref_1', NOW);
    expect(op.status).toBe(OperationStatus.COMPLETED);
    expect(op.isTerminal()).toBe(true);
    expect(op.completedAt).toEqual(NOW);
  });

  it('COMPLETED es terminal e impide nuevas transiciones', () => {
    const op = newOperation().markCompleted({}, 'ref_1', NOW);
    expect(() => op.markFailed('x', NOW)).toThrow(InvalidStateTransitionError);
    expect(() => op.markTimeoutUnknown(null, NOW)).toThrow(InvalidStateTransitionError);
  });

  it('FAILED puede transicionar a COMPLETED por un webhook de éxito', () => {
    const op = newOperation().markFailed('declined', NOW).markCompleted({}, 'ref_1', NOW);
    expect(op.status).toBe(OperationStatus.COMPLETED);
  });

  it('PENDING_GATEWAY -> FAILED ante decline', () => {
    const op = newOperation().markFailed('declined', NOW);
    expect(op.status).toBe(OperationStatus.FAILED);
    expect(op.failureReason).toBe('declined');
  });
});
