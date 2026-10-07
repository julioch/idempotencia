import { InvalidCurrencyError } from '../exceptions/domain.exception';

const ISO_4217_RE = /^[A-Z]{3}$/;

export class Currency {
  private constructor(readonly code: string) {}

  static from(code: string): Currency {
    if (typeof code !== 'string' || !ISO_4217_RE.test(code)) {
      throw new InvalidCurrencyError(code);
    }
    return new Currency(code);
  }

  equals(other: Currency): boolean {
    return this.code === other.code;
  }

  toString(): string {
    return this.code;
  }
}
