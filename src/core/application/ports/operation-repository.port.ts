import { Operation } from '../../domain/entities/operation';
import { OperationStatus } from '../../domain/value-objects/operation-status';

export interface IOperationRepository {
  /** INSERT. Lanza DuplicateKeyError ante violación de UNIQUE(user_id, idempotency_key). */
  create(operation: Operation): Promise<void>;

  save(operation: Operation): Promise<void>;

  findById(id: string): Promise<Operation | null>;

  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<Operation | null>;

  /** Operaciones estancadas (para el reconciliador). */
  findStale(statuses: OperationStatus[], olderThan: Date, limit: number): Promise<Operation[]>;
}
