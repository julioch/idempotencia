import { Money } from '../../domain/value-objects/money';

export interface ApplyCreditParams {
  userId: string;
  currency: string;
  operationId: string;
  amount: Money;
}

export interface ApplyCreditResult {
  newBalanceCents: number;
  /** true si el asiento ya existía (doble crédito evitado por UNIQUE(operation_id, entry_type)). */
  alreadyApplied: boolean;
}

export interface IWalletLedgerPort {
  ensureWallet(userId: string, currency: string): Promise<void>;

  getBalanceCents(userId: string, currency: string): Promise<number | null>;

  /**
   * Bloquea la billetera con SELECT ... FOR UPDATE, inserta el asiento inmutable en
   * ledger_entries y actualiza el saldo, todo en la transacción en curso.
   */
  applyCredit(params: ApplyCreditParams): Promise<ApplyCreditResult>;
}
