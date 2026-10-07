import { InitiateCashInUseCase } from '../../../src/core/application/use-cases/initiate-cash-in.use-case';
import { CashInProcessor } from '../../../src/core/application/services/cash-in.processor';
import { Operation } from '../../../src/core/domain/entities/operation';
import { Money } from '../../../src/core/domain/value-objects/money';
import { OperationStatus } from '../../../src/core/domain/value-objects/operation-status';
import { DuplicateKeyError, OperationInProgressError, ProviderUnavailableError } from '../../../src/core/application/errors/application.errors';
import {
  createClockMock,
  createContextMocks,
  createPaymentProviderMock,
} from '../helpers/mocks';

const NOW = new Date('2026-10-06T22:00:00.000Z');
const KEY = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

const COMMAND = {
  userId: 'usr_abc123',
  amount: 100,
  currency: 'PEN',
  paymentMethod: 'card_xyz',
  idempotencyKey: KEY,
};

function buildOperation(status: 'PENDING_GATEWAY' | 'TIMEOUT_UNKNOWN' | 'FAILED'): Operation {
  const op = Operation.create({
    userId: 'usr_abc123',
    idempotencyKey: KEY,
    amount: Money.fromDecimal(100, 'PEN'),
    paymentMethod: 'card_xyz',
    now: NOW,
    id: 'op_test',
  });
  if (status === OperationStatus.TIMEOUT_UNKNOWN) return op.markTimeoutUnknown('ref_1', NOW);
  if (status === OperationStatus.FAILED) return op.markFailed('declined', NOW);
  return op;
}

function buildCompletedOperation(): Operation {
  return buildOperation(OperationStatus.PENDING_GATEWAY).markCompleted(
    {
      operation_id: 'op_test',
      status: 'completed',
      amount: 100,
      new_balance: 350,
      provider_reference: 'ref_1',
    },
    'ref_1',
    NOW,
  );
}

function setup(clockDate: Date = NOW) {
  const { operations, wallet, webhooks, unitOfWork } = createContextMocks();
  const provider = createPaymentProviderMock();
  const clock = createClockMock(clockDate);
  const processor = new CashInProcessor(operations, unitOfWork, provider, clock, 30000);
  const useCase = new InitiateCashInUseCase(operations, processor, clock);
  return { useCase, operations, wallet, webhooks, unitOfWork, provider, clock };
}

describe('InitiateCashInUseCase', () => {
  it('happy path: cobra, acredita el ledger y marca COMPLETED', async () => {
    // Arrange
    const { useCase, operations, wallet, provider } = setup();
    operations.create.mockResolvedValue(undefined as never);
    provider.charge.mockResolvedValue({ providerReference: 'ref_1', status: 'SUCCEEDED' });
    wallet.applyCredit.mockResolvedValue({ newBalanceCents: 35000, alreadyApplied: false });

    // Act
    const result = await useCase.execute(COMMAND);

    // Assert
    expect(result.httpStatus).toBe(200);
    expect(result.payload).toMatchObject({ status: 'completed', amount: 100, new_balance: 350 });
    expect(provider.charge).toHaveBeenCalledTimes(1);
    expect(wallet.applyCredit).toHaveBeenCalledWith(
      expect.objectContaining({ amount: expect.objectContaining({ cents: 10000 }) }),
    );
    const saved = operations.save.mock.calls[0][0];
    expect(saved.status).toBe(OperationStatus.COMPLETED);
  });

  it('idempotencia: misma key ya COMPLETED devuelve el payload persistido sin llamar a la pasarela', async () => {
    // Arrange
    const { useCase, operations, provider } = setup();
    operations.create.mockRejectedValue(new DuplicateKeyError('duplicate'));
    operations.findByIdempotencyKey.mockResolvedValue(buildCompletedOperation());

    // Act
    const result = await useCase.execute(COMMAND);

    // Assert
    expect(result.payload.new_balance).toBe(350);
    expect(result.httpStatus).toBe(200);
    expect(provider.charge).not.toHaveBeenCalled();
    expect(operations.save).not.toHaveBeenCalled();
  });

  it('colisión concurrente (23505) en progreso: lanza OperationInProgressError sin recobrar', async () => {
    // Arrange
    const { useCase, operations, provider } = setup();
    operations.create.mockRejectedValue(new DuplicateKeyError('duplicate'));
    operations.findByIdempotencyKey.mockResolvedValue(buildOperation(OperationStatus.PENDING_GATEWAY));

    // Act / Assert
    await expect(useCase.execute(COMMAND)).rejects.toBeInstanceOf(OperationInProgressError);
    expect(provider.charge).not.toHaveBeenCalled();
  });

  it('reinicio del servicio: PENDING_GATEWAY estancada se retoma por reconciliación', async () => {
    // Arrange
    const { useCase, operations, provider, wallet } = setup(new Date(NOW.getTime() + 60_000));
    operations.create.mockRejectedValue(new DuplicateKeyError('duplicate'));
    operations.findByIdempotencyKey.mockResolvedValue(buildOperation(OperationStatus.PENDING_GATEWAY));
    provider.getChargeStatus.mockResolvedValue({ status: 'SUCCEEDED', providerReference: 'ref_1' });
    wallet.applyCredit.mockResolvedValue({ newBalanceCents: 35000, alreadyApplied: false });

    // Act
    const result = await useCase.execute(COMMAND);

    // Assert
    expect(provider.charge).not.toHaveBeenCalled();
    expect(provider.getChargeStatus).toHaveBeenCalledTimes(1);
    expect(result.payload.status).toBe('completed');
  });

  it('timeout del proveedor: marca TIMEOUT_UNKNOWN (nunca FAILED) y responde 202', async () => {
    // Arrange
    const { useCase, operations, provider } = setup();
    operations.create.mockResolvedValue(undefined as never);
    provider.charge.mockRejectedValue(new ProviderUnavailableError());

    // Act
    const result = await useCase.execute(COMMAND);

    // Assert
    expect(result.httpStatus).toBe(202);
    expect(result.payload.status).toBe('timeout_unknown');
    const saved = operations.save.mock.calls[0][0];
    expect(saved.status).toBe(OperationStatus.TIMEOUT_UNKNOWN);
    expect(saved.status).not.toBe(OperationStatus.FAILED);
  });

  it('decline del proveedor: marca FAILED y responde 402', async () => {
    // Arrange
    const { useCase, operations, provider } = setup();
    operations.create.mockResolvedValue(undefined as never);
    provider.charge.mockResolvedValue({ providerReference: 'ref_1', status: 'DECLINED' });

    // Act
    const result = await useCase.execute(COMMAND);

    // Assert
    expect(result.httpStatus).toBe(402);
    expect(result.payload.status).toBe('failed');
    expect(operations.save.mock.calls[0][0].status).toBe(OperationStatus.FAILED);
  });

  it('retry tras timeout: concilia con getChargeStatus antes de volver a cobrar', async () => {
    // Arrange
    const { useCase, operations, provider, wallet } = setup();
    operations.create.mockRejectedValue(new DuplicateKeyError('duplicate'));
    operations.findByIdempotencyKey.mockResolvedValue(buildOperation(OperationStatus.TIMEOUT_UNKNOWN));
    provider.getChargeStatus.mockResolvedValue({ status: 'SUCCEEDED', providerReference: 'ref_1' });
    wallet.applyCredit.mockResolvedValue({ newBalanceCents: 35000, alreadyApplied: false });

    // Act
    const result = await useCase.execute(COMMAND);

    // Assert
    expect(provider.charge).not.toHaveBeenCalled();
    expect(provider.getChargeStatus).toHaveBeenCalledWith(
      expect.objectContaining({ providerReference: 'ref_1', operationId: 'op_test' }),
    );
    expect(wallet.applyCredit).toHaveBeenCalledTimes(1);
    expect(result.payload.status).toBe('completed');
    expect(result.payload.new_balance).toBe(350);
  });
});
