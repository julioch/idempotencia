import { Money } from '../value-objects/money';

export type LedgerEntryType = 'CREDIT' | 'DEBIT';

export interface LedgerEntrySnapshot {
  id?: number;
  operationId: string;
  userId: string;
  entryType: LedgerEntryType;
  amount: Money;
  balanceAfter: Money;
  createdAt: Date;
}

export class LedgerEntry {
  private constructor(private readonly props: LedgerEntrySnapshot) {}

  static recordCredit(params: {
    operationId: string;
    userId: string;
    amount: Money;
    balanceAfter: Money;
    now: Date;
  }): LedgerEntry {
    return new LedgerEntry({
      operationId: params.operationId,
      userId: params.userId,
      entryType: 'CREDIT',
      amount: params.amount,
      balanceAfter: params.balanceAfter,
      createdAt: params.now,
    });
  }

  static recordDebit(params: {
    operationId: string;
    userId: string;
    amount: Money;
    balanceAfter: Money;
    now: Date;
  }): LedgerEntry {
    return new LedgerEntry({
      operationId: params.operationId,
      userId: params.userId,
      entryType: 'DEBIT',
      amount: params.amount,
      balanceAfter: params.balanceAfter,
      createdAt: params.now,
    });
  }

  get id(): number | undefined {
    return this.props.id;
  }

  get operationId(): string {
    return this.props.operationId;
  }

  get userId(): string {
    return this.props.userId;
  }

  get entryType(): LedgerEntryType {
    return this.props.entryType;
  }

  get amount(): Money {
    return this.props.amount;
  }

  get balanceAfter(): Money {
    return this.props.balanceAfter;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
