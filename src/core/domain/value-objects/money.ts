import { Currency } from './currency';
import { InsufficientFundsError, InvalidMoneyError } from '../exceptions/domain.exception';

/**
 * Value Object de dinero. Internamente SIEMPRE en centavos (enteros) para evitar
 * errores de punto flotante. La conversión a decimal solo ocurre en el borde HTTP.
 */
export class Money {
  private constructor(
    readonly cents: number,
    readonly currency: Currency,
  ) {}

  static fromCents(cents: number, currency: string | Currency): Money {
    if (!Number.isSafeInteger(cents)) {
      throw new InvalidMoneyError(`Los centavos deben ser un entero seguro: ${cents}`);
    }
    if (cents < 0) {
      throw new InvalidMoneyError(`Los centavos no pueden ser negativos: ${cents}`);
    }
    const cur = typeof currency === 'string' ? Currency.from(currency) : currency;
    return new Money(cents, cur);
  }

  static fromDecimal(amount: number, currency: string | Currency): Money {
    if (typeof amount !== 'number' || !Number.isFinite(amount)) {
      throw new InvalidMoneyError(`Monto inválido: ${String(amount)}`);
    }
    const scaled = amount * 100;
    const cents = Math.round(scaled);
    if (Math.abs(scaled - cents) > 1e-6) {
      throw new InvalidMoneyError(`El monto no puede tener más de 2 decimales: ${amount}`);
    }
    return Money.fromCents(cents, currency);
  }

  private assertSameCurrency(other: Money): void {
    if (!this.currency.equals(other.currency)) {
      throw new InvalidMoneyError(
        `No se pueden operar montos de distinta moneda: ${this.currency.code} vs ${other.currency.code}`,
      );
    }
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.cents + other.cents, this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    const result = this.cents - other.cents;
    if (result < 0) {
      throw new InsufficientFundsError();
    }
    return new Money(result, this.currency);
  }

  isPositive(): boolean {
    return this.cents > 0;
  }

  equals(other: Money): boolean {
    return this.cents === other.cents && this.currency.equals(other.currency);
  }

  toDecimal(): number {
    return this.cents / 100;
  }

  toJSON(): { amount: number; currency: string } {
    return { amount: this.toDecimal(), currency: this.currency.code };
  }
}
