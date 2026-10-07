import {
  ApplyCreditParams,
  ApplyCreditResult,
  IWalletLedgerPort,
} from '../../core/application/ports/wallet-ledger.port';
import { Queryable } from '../database/types';

export class PgWalletLedgerRepository implements IWalletLedgerPort {
  constructor(private readonly db: Queryable) {}

  async ensureWallet(userId: string, currency: string): Promise<void> {
    await this.db.query(
      `INSERT INTO wallets (user_id, currency, balance_cents)
       VALUES ($1, $2, 0)
       ON CONFLICT (user_id, currency) DO NOTHING`,
      [userId, currency],
    );
  }

  async getBalanceCents(userId: string, currency: string): Promise<number | null> {
    const result = await this.db.query<{ balance_cents: string }>(
      `SELECT balance_cents FROM wallets WHERE user_id = $1 AND currency = $2`,
      [userId, currency],
    );
    const row = result.rows[0];
    return row ? Number(row.balance_cents) : null;
  }

  async applyCredit(params: ApplyCreditParams): Promise<ApplyCreditResult> {
    await this.ensureWallet(params.userId, params.currency);

    // Bloqueo pesimista: serializa créditos concurrentes sobre la misma billetera.
    const locked = await this.db.query<{ balance_cents: string }>(
      `SELECT balance_cents FROM wallets
       WHERE user_id = $1 AND currency = $2
       FOR UPDATE`,
      [params.userId, params.currency],
    );
    const current = Number(locked.rows[0].balance_cents);
    const newBalance = current + params.amount.cents;

    // Asiento inmutable. UNIQUE(operation_id, entry_type) evita el doble crédito.
    const inserted = await this.db.query<{ id: number }>(
      `INSERT INTO ledger_entries (
         operation_id, user_id, entry_type, amount_cents, currency, balance_after_cents
       ) VALUES ($1, $2, 'CREDIT', $3, $4, $5)
       ON CONFLICT (operation_id, entry_type) DO NOTHING
       RETURNING id`,
      [params.operationId, params.userId, params.amount.cents, params.currency, newBalance],
    );

    if (inserted.rowCount === 0) {
      return { newBalanceCents: current, alreadyApplied: true };
    }

    await this.db.query(
      `UPDATE wallets
       SET balance_cents = $3, version = version + 1, updated_at = now()
       WHERE user_id = $1 AND currency = $2`,
      [params.userId, params.currency, newBalance],
    );

    return { newBalanceCents: newBalance, alreadyApplied: false };
  }
}
