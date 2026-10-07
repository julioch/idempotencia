import { Money } from '../value-objects/money';
import { IdempotencyKey } from '../value-objects/idempotency-key';
import {
  assertTransition,
  isTerminal,
  OperationStatus,
} from '../value-objects/operation-status';
import { InvalidMoneyError } from '../exceptions/domain.exception';
import { generateOperationId } from '../utils/id';

export interface OperationSnapshot {
  id: string;
  userId: string;
  idempotencyKey: string;
  amount: Money;
  paymentMethod: string;
  status: OperationStatus;
  providerReference: string | null;
  responsePayload: Record<string, unknown> | null;
  failureReason: string | null;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface CreateOperationParams {
  userId: string;
  idempotencyKey: string;
  amount: Money;
  paymentMethod: string;
  now: Date;
  id?: string;
}

export class Operation {
  private constructor(private readonly props: OperationSnapshot) {}

  static create(params: CreateOperationParams): Operation {
    if (!params.amount.isPositive()) {
      throw new InvalidMoneyError('El monto de la recarga debe ser mayor a cero');
    }
    const key = IdempotencyKey.from(params.idempotencyKey);
    return new Operation({
      id: params.id ?? generateOperationId(),
      userId: params.userId,
      idempotencyKey: key.value,
      amount: params.amount,
      paymentMethod: params.paymentMethod,
      status: OperationStatus.PENDING_GATEWAY,
      providerReference: null,
      responsePayload: null,
      failureReason: null,
      retryCount: 0,
      createdAt: params.now,
      updatedAt: params.now,
      completedAt: null,
    });
  }

  static rehydrate(props: OperationSnapshot): Operation {
    return new Operation(props);
  }

  get id(): string {
    return this.props.id;
  }

  get userId(): string {
    return this.props.userId;
  }

  get idempotencyKey(): string {
    return this.props.idempotencyKey;
  }

  get amount(): Money {
    return this.props.amount;
  }

  get paymentMethod(): string {
    return this.props.paymentMethod;
  }

  get status(): OperationStatus {
    return this.props.status;
  }

  get providerReference(): string | null {
    return this.props.providerReference;
  }

  get responsePayload(): Record<string, unknown> | null {
    return this.props.responsePayload;
  }

  get failureReason(): string | null {
    return this.props.failureReason;
  }

  get retryCount(): number {
    return this.props.retryCount;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get completedAt(): Date | null {
    return this.props.completedAt;
  }

  isTerminal(): boolean {
    return isTerminal(this.props.status);
  }

  isTimedOut(): boolean {
    return this.props.status === OperationStatus.TIMEOUT_UNKNOWN;
  }

  isCompleted(): boolean {
    return this.props.status === OperationStatus.COMPLETED;
  }

  isFailed(): boolean {
    return this.props.status === OperationStatus.FAILED;
  }

  markCompleted(
    responsePayload: Record<string, unknown>,
    providerReference: string | null,
    now: Date,
  ): Operation {
    assertTransition(this.props.status, OperationStatus.COMPLETED);
    return this.with({
      status: OperationStatus.COMPLETED,
      responsePayload,
      providerReference: providerReference ?? this.props.providerReference,
      failureReason: null,
      completedAt: now,
      updatedAt: now,
    });
  }

  markFailed(reason: string, now: Date): Operation {
    assertTransition(this.props.status, OperationStatus.FAILED);
    return this.with({
      status: OperationStatus.FAILED,
      failureReason: reason,
      updatedAt: now,
    });
  }

  markTimeoutUnknown(providerReference: string | null, now: Date): Operation {
    assertTransition(this.props.status, OperationStatus.TIMEOUT_UNKNOWN);
    return this.with({
      status: OperationStatus.TIMEOUT_UNKNOWN,
      providerReference: providerReference ?? this.props.providerReference,
      updatedAt: now,
    });
  }

  registerRetry(now: Date): Operation {
    return this.with({ retryCount: this.props.retryCount + 1, updatedAt: now });
  }

  private with(patch: Partial<OperationSnapshot>): Operation {
    return new Operation({ ...this.props, ...patch });
  }
}
