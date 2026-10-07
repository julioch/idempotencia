import { Wallet } from '../../../src/core/domain/entities/wallet';
import { Money } from '../../../src/core/domain/value-objects/money';
import { Currency } from '../../../src/core/domain/value-objects/currency';
import { InsufficientFundsError } from '../../../src/core/domain/exceptions/domain.exception';

describe('Wallet (invariantes)', () => {
  const pen = Currency.from('PEN');

  it('acredita y devuelve una nueva instancia (inmutable)', () => {
    const wallet = Wallet.create('usr_1', pen, Money.fromCents(25000, 'PEN'));
    const updated = wallet.credit(Money.fromCents(10000, 'PEN'));
    expect(wallet.balance.cents).toBe(25000);
    expect(updated.balance.cents).toBe(35000);
  });

  it('no permite debitar por encima del saldo', () => {
    const wallet = Wallet.create('usr_1', pen, Money.fromCents(100, 'PEN'));
    expect(() => wallet.debit(Money.fromCents(200, 'PEN'))).toThrow(InsufficientFundsError);
  });

  it('no permite creditar en distinta moneda', () => {
    const wallet = Wallet.create('usr_1', pen, Money.fromCents(100, 'PEN'));
    expect(() => wallet.credit(Money.fromCents(100, 'USD'))).toThrow();
  });
});
