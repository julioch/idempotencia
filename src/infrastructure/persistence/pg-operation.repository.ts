import { Operation } from '../../core/domain/entities/operation';
import { OperationStatus } from '../../core/domain/value-objects/operation-status';
import { IOperationRepository } from '../../core/application/ports/operation-repository.port';
import { DuplicateKeyError } from '../../core/application/errors/application.errors';
import { Queryable } from '../database/types';
import { isUniqueViolation } from './pg-errors';
import { OperationRow, toDomainOperation } from './operation.mapper';

const SELECT_COLUMNS = `
  id, user_id, idempotency_key, amount_cents, currency, payment_method, status,
  provider_reference, response_payload, failure_reason, retry_count,
  created_at, updated_at, completed_at
`;

export class PgOperationRepository implements IOperationRepository {
  constructor(private readonly db: Queryable) {}

  async create(operation: Operation): Promise<void> {
    try {
      await this.db.query(
        `INSERT INTO operations (
           id, user_id, idempotency_key, amount_cents, currency, payment_method, status,
           provider_reference, response_payload, failure_reason, retry_count,
           created_at, updated_at, completed_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14)`,
        [
          operation.id,
          operation.userId,
          operation.idempotencyKey,
          operation.amount.cents,
          operation.amount.currency.code,
          operation.paymentMethod,
          operation.status,
          operation.providerReference,
          operation.responsePayload ? JSON.stringify(operation.responsePayload) : null,
          operation.failureReason,
          operation.retryCount,
          operation.createdAt,
          operation.updatedAt,
          operation.completedAt,
        ],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new DuplicateKeyError('operation duplicada', error.constraint);
      }
      throw error;
    }
  }

  async save(operation: Operation): Promise<void> {
    await this.db.query(
      `UPDATE operations SET
         status = $2,
         provider_reference = $3,
         response_payload = $4::jsonb,
         failure_reason = $5,
         retry_count = $6,
         updated_at = $7,
         completed_at = $8
       WHERE id = $1`,
      [
        operation.id,
        operation.status,
        operation.providerReference,
        operation.responsePayload ? JSON.stringify(operation.responsePayload) : null,
        operation.failureReason,
        operation.retryCount,
        operation.updatedAt,
        operation.completedAt,
      ],
    );
  }

  async findById(id: string): Promise<Operation | null> {
    const result = await this.db.query<OperationRow>(
      `SELECT ${SELECT_COLUMNS} FROM operations WHERE id = $1`,
      [id],
    );
    const row = result.rows[0];
    return row ? toDomainOperation(row) : null;
  }

  async findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<Operation | null> {
    const result = await this.db.query<OperationRow>(
      `SELECT ${SELECT_COLUMNS} FROM operations WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, idempotencyKey],
    );
    const row = result.rows[0];
    return row ? toDomainOperation(row) : null;
  }

  async findStale(
    statuses: OperationStatus[],
    olderThan: Date,
    limit: number,
  ): Promise<Operation[]> {
    const result = await this.db.query<OperationRow>(
      `SELECT ${SELECT_COLUMNS} FROM operations
       WHERE status = ANY($1::text[]) AND updated_at < $2
       ORDER BY updated_at ASC
       LIMIT $3`,
      [statuses, olderThan, limit],
    );
    return result.rows.map(toDomainOperation);
  }
}
