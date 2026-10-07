import { Money } from '../../../src/core/domain/value-objects/money';
import {
  InsufficientFundsError,
  InvalidMoneyError,
} from '../../../src/core/domain/exceptions/domain.exception';

describe('Money (Value Object)', () => {
  describe('fromDecimal', () => {
    it('convierte correctamente 100.00 a 10000 centavos', () => {
      // Arrange / Act
      const money = Money.fromDecimal(100.0, 'PEN');

      // Assert
      expect(money.cents).toBe(10000);
      expect(money.currency.code).toBe('PEN');
      expect(money.toDecimal()).toBe(100);
    });

    it('redondea de forma segura montos con 2 decimales (99.99)', () => {
      const money = Money.fromDecimal(99.99, 'PEN');
      expect(money.cents).toBe(9999);
    });

    it('rechaza montos con más de 2 decimales', () => {
      expect(() => Money.fromDecimal(10.123, 'PEN')).toThrow(InvalidMoneyError);
    });

    it('rechaza una moneda inválida', () => {
      expect(() => Money.fromDecimal(10, 'PENN')).toThrow();
    });
  });

  describe('aritmética', () => {
    it('suma montos de la misma moneda', () => {
      const total = Money.fromCents(25000, 'PEN').add(Money.fromCents(10000, 'PEN'));
      expect(total.cents).toBe(35000);
    });

    it('lanza InsufficientFundsError al restar por encima del saldo', () => {
      expect(() => Money.fromCents(100, 'PEN').subtract(Money.fromCents(200, 'PEN'))).toThrow(
        InsufficientFundsError,
      );
    });

    it('no permite operar montos de distinta moneda', () => {
      expect(() => Money.fromCents(100, 'PEN').add(Money.fromCents(100, 'USD'))).toThrow(
        InvalidMoneyError,
      );
    });
  });

  it('no permite centavos negativos', () => {
    expect(() => Money.fromCents(-1, 'PEN')).toThrow(InvalidMoneyError);
  });
});
