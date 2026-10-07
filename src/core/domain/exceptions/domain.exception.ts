export class DomainException extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidCurrencyError extends DomainException {
  constructor(value: unknown) {
    super(`Moneda inválida: ${String(value)}`, 'INVALID_CURRENCY');
  }
}

export class InvalidMoneyError extends DomainException {
  constructor(message: string) {
    super(message, 'INVALID_MONEY');
  }
}

export class InvalidIdempotencyKeyError extends DomainException {
  constructor(value: unknown) {
    super(`Idempotency-Key inválida (se espera UUID): ${String(value)}`, 'INVALID_IDEMPOTENCY_KEY');
  }
}

export class InvalidStateTransitionError extends DomainException {
  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(`Transición de estado inválida: ${from} -> ${to}`, 'INVALID_STATE_TRANSITION');
  }
}

export class InsufficientFundsError extends DomainException {
  constructor(message = 'Saldo insuficiente para completar la operación') {
    super(message, 'INSUFFICIENT_FUNDS');
  }
}
