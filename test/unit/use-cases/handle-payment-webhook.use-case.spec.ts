import { HandlePaymentWebhookUseCase } from '../../../src/core/application/use-cases/handle-payment-webhook.use-case';
import { Operation } from '../../../src/core/domain/entities/operation';
import {
  WebhookEvent,
  WebhookEventType,
} from '../../../src/core/domain/entities/webhook-event';
import { Money } from '../../../src/core/domain/value-objects/money';
import { OperationStatus } from '../../../src/core/domain/value-objects/operation-status';
import { DuplicateKeyError } from '../../../src/core/application/errors/application.errors';
import { createClockMock, createContextMocks } from '../helpers/mocks';

const NOW = new Date('2026-10-06T22:00:00.000Z');
const KEY = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

function pendingOperation(): Operation {
  return Operation.create({
    userId: 'usr_abc123',
    idempotencyKey: KEY,
    amount: Money.fromDecimal(100, 'PEN'),
    paymentMethod: 'card_xyz',
    now: NOW,
    id: 'op_test',
  });
}

function completedOperation(): Operation {
  return pendingOperation().markCompleted(
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

function storedEvent(id = 1) {
  return WebhookEvent.create({
    providerReference: 'ref_ext_999',
    eventType: WebhookEventType.PAYMENT_SUCCEEDED,
    operationId: 'op_test',
    payload: {},
    now: NOW,
  }).withId(id);
}

const SUCCEEDED_CMD = {
  providerReference: 'ref_ext_999',
  operationId: 'op_test',
  eventType: WebhookEventType.PAYMENT_SUCCEEDED,
  timestamp: NOW.toISOString(),
  raw: { provider_reference: 'ref_ext_999', event_type: 'payment.succeeded' },
};

function setup() {
  const { operations, wallet, webhooks, unitOfWork } = createContextMocks();
  const clock = createClockMock(NOW);
  const useCase = new HandlePaymentWebhookUseCase(operations, unitOfWork, webhooks, clock);
  return { useCase, operations, wallet, webhooks, unitOfWork };
}

describe('HandlePaymentWebhookUseCase', () => {
  it('webhook antes de la respuesta del API: completa la operación y acredita una sola vez', async () => {
    // Arrange
    const { useCase, operations, wallet, webhooks } = setup();
    webhooks.insert.mockResolvedValue(storedEvent());
    operations.findById.mockResolvedValue(pendingOperation());
    wallet.applyCredit.mockResolvedValue({ newBalanceCents: 35000, alreadyApplied: false });

    // Act
    const result = await useCase.execute(SUCCEEDED_CMD);

    // Assert
    expect(result.processed).toBe(true);
    expect(wallet.applyCredit).toHaveBeenCalledTimes(1);
    expect(operations.save.mock.calls[0][0].status).toBe(OperationStatus.COMPLETED);
    expect(webhooks.markProcessed).toHaveBeenCalledWith(1, 'PROCESSED', NOW);
  });

  it('webhook duplicado ya procesado: no vuelve a modificar el saldo', async () => {
    // Arrange
    const { useCase, operations, wallet, webhooks } = setup();
    webhooks.insert.mockRejectedValue(new DuplicateKeyError('duplicate'));
    webhooks.findByReferenceAndType.mockResolvedValue(
      storedEvent().markProcessed('PROCESSED', NOW),
    );

    // Act
    const result = await useCase.execute(SUCCEEDED_CMD);

    // Assert
    expect(result.duplicate).toBe(true);
    expect(result.processed).toBe(false);
    expect(wallet.applyCredit).not.toHaveBeenCalled();
    expect(operations.save).not.toHaveBeenCalled();
  });

  it('webhook fuera de orden: fallo recibido tras COMPLETED se ignora', async () => {
    // Arrange
    const { useCase, operations, wallet, webhooks } = setup();
    webhooks.insert.mockResolvedValue(storedEvent(2));
    operations.findById.mockResolvedValue(completedOperation());

    // Act
    const result = await useCase.execute({ ...SUCCEEDED_CMD, eventType: WebhookEventType.PAYMENT_FAILED });

    // Assert
    expect(result.ignored).toBe(true);
    expect(wallet.applyCredit).not.toHaveBeenCalled();
    expect(operations.save).not.toHaveBeenCalled();
    expect(webhooks.markProcessed).toHaveBeenCalledWith(2, 'IGNORED', NOW);
  });

  it('operación desconocida: registra el evento como ORPHAN', async () => {
    // Arrange
    const { useCase, operations, webhooks } = setup();
    webhooks.insert.mockResolvedValue(storedEvent(3));
    operations.findById.mockResolvedValue(null);

    // Act
    const result = await useCase.execute(SUCCEEDED_CMD);

    // Assert
    expect(result.orphan).toBe(true);
    expect(webhooks.markProcessed).toHaveBeenCalledWith(3, 'ORPHAN', NOW);
  });
});
