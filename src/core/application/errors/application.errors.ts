/** Error de unicidad de base de datos (PostgreSQL SQLSTATE 23505). */
export class DuplicateKeyError extends Error {
  constructor(
    message: string,
    readonly constraint?: string,
  ) {
    super(message);
    this.name = 'DuplicateKeyError';
  }
}

/**
 * El proveedor de pagos no respondió de forma determinista (timeout de red o 5xx).
 * El resultado del cobro es DESCONOCIDO: jamás debe asumirse FAILED.
 */
export class ProviderUnavailableError extends Error {
  constructor(message = 'El proveedor de pagos no respondió de forma determinista') {
    super(message);
    this.name = 'ProviderUnavailableError';
  }
}

/** Ya existe una operación con la misma Idempotency-Key y está en curso. */
export class OperationInProgressError extends Error {
  constructor(readonly operationId: string) {
    super(`La operación ${operationId} ya está en curso`);
    this.name = 'OperationInProgressError';
  }
}
