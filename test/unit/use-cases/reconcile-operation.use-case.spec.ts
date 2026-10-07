import { ReconcileOperationUseCase } from '../../../src/core/application/use-cases/reconcile-operation.use-case';
import { CashInProcessor } from '../../../src/core/application/services/cash-in.processor';
import { Operation } from '../../../src/core/domain/entities/operation';
import { Money } from '../../../src/core/domain/value-objects/money';
import { OperationStatus } from '../../../src/core/domain/value-objects/operation-status';
import { createClockMock, createContextMocks, createPaymentProviderMock } from '../helpers/mocks';

const NOW = new Date('2026-10-06T22:00:00.000Z');
const KEY = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

function timedOutOperation(): Operation {
  return Operation.create({
    userId: 'usr_abc123',
    idempotencyKey: KEY,
    amount: Money.fromDecimal(100, 'PEN'),
    paymentMethod: 'card_xyz',
    now: NOW,
    id: 'op_test',
  }).markTimeoutUnknown(null, NOW);
}

function setup() {
  const { operations, wallet, unitOfWork } = createContextMocks();
  const provider = createPaymentProviderMock();
  const clock = createClockMock(NOW);
  const processor = new CashInProcessor(operations, unitOfWork, provider, clock, 30000);
  const useCase = new ReconcileOperationUseCase(operations, processor);
  return { useCase, operations, wallet, provider };
}

describe('ReconcileOperationUseCase', () => {
  it('TIMEOUT_UNKNOWN + proveedor SUCCEEDED -> acredita y marca COMPLETED', async () => {
    // Arrange
    const { useCase, operations, wallet, provider } = setup();
    operations.findById.mockResolvedValue(timedOutOperation());
    provider.getChargeStatus.mockResolvedValue({ status: 'SUCCEEDED', providerReference: 'ref_1' });
    wallet.applyCredit.mockResolvedValue({ newBalanceCents: 35000, alreadyApplied: true });

    // Act
    const result = await useCase.execute('op_test');

    // Assert
    expect(result?.payload.status).toBe('completed');
    expect(wallet.applyCredit).toHaveBeenCalledTimes(1);
    expect(provider.charge).not.toHaveBeenCalled();
  });

  it('TIMEOUT_UNKNOWN + proveedor DECLINED -> marca FAILED', async () => {
    // Arrange
    const { useCase, operations, provider } = setup();
    operations.findById.mockResolvedValue(timedOutOperation());
    provider.getChargeStatus.mockResolvedValue({ status: 'DECLINED', providerReference: 'ref_1' });

    // Act
    const result = await useCase.execute('op_test');

    // Assert
    expect(result?.payload.status).toBe('failed');
    expect(operations.save.mock.calls[0][0].status).toBe(OperationStatus.FAILED);
  });

  it('TIMEOUT_UNKNOWN + NOT_FOUND -> recobro seguro con la misma idempotency key', async () => {
    // Arrange
    const { useCase, operations, wallet, provider } = setup();
    operations.findById.mockResolvedValue(timedOutOperation());
    provider.getChargeStatus.mockResolvedValue({ status: 'NOT_FOUND', providerReference: null });
    provider.charge.mockResolvedValue({ providerReference: 'ref_9', status: 'SUCCEEDED' });
    wallet.applyCredit.mockResolvedValue({ newBalanceCents: 35000, alreadyApplied: false });

    // Act
    const result = await useCase.execute('op_test');

    // Assert
    expect(provider.charge).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'op_test' }),
    );
    expect(result?.payload.status).toBe('completed');
  });

  it('TIMEOUT_UNKNOWN + PENDING -> permanece en TIMEOUT_UNKNOWN', async () => {
    // Arrange
    const { useCase, operations, provider } = setup();
    operations.findById.mockResolvedValue(timedOutOperation());
    provider.getChargeStatus.mockResolvedValue({ status: 'PENDING', providerReference: 'ref_1' });

    // Act
    const result = await useCase.execute('op_test');

    // Assert
    expect(result?.payload.status).toBe('timeout_unknown');
    expect(result?.httpStatus).toBe(202);
  });

  it('operación inexistente devuelve null', async () => {
    const { useCase, operations } = setup();
    operations.findById.mockResolvedValue(null);
    await expect(useCase.execute('op_missing')).resolves.toBeNull();
  });
});
