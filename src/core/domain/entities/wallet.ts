import { Money } from '../value-objects/money';
import { Currency } from '../value-objects/currency';
import { InvalidCurrencyError } from '../exceptions/domain.exception';

export class Wallet {
  private constructor(
    readonly userId: string,
    readonly currency: Currency,
    readonly balance: Money,
  ) {}

  static create(userId: string, currency: Currency, balance: Money): Wallet {
    if (!balance.currency.equals(currency)) {
      throw new InvalidCurrencyError(balance.currency.code);
    }
    return new Wallet(userId, currency, balance);
  }

  private assertSameCurrency(amount: Money): void {
    if (!amount.currency.equals(this.currency)) {
      throw new InvalidCurrencyError(amount.currency.code);
    }
  }

  credit(amount: Money): Wallet {
    this.assertSameCurrency(amount);
    return new Wallet(this.userId, this.currency, this.balance.add(amount));
  }

  debit(amount: Money): Wallet {
    this.assertSameCurrency(amount);
    return new Wallet(this.userId, this.currency, this.balance.subtract(amount));
  }
}
