import { Operation } from '../../domain/entities/operation';
import { Money } from '../../domain/value-objects/money';
import { IOperationRepository } from '../ports/operation-repository.port';
import { IClock } from '../ports/clock.port';
import { CashInOutcome, InitiateCashInCommand } from '../dto/cash-in.dto';
import { CashInProcessor } from '../services/cash-in.processor';
import { DuplicateKeyError } from '../errors/application.errors';

export class InitiateCashInUseCase {
  constructor(
    private readonly operations: IOperationRepository,
    private readonly processor: CashInProcessor,
    private readonly clock: IClock,
  ) {}

  async execute(command: InitiateCashInCommand): Promise<CashInOutcome> {
    const now = this.clock.now();
    const amount = Money.fromDecimal(command.amount, command.currency);

    const operation = Operation.create({
      userId: command.userId,
      idempotencyKey: command.idempotencyKey,
      amount,
      paymentMethod: command.paymentMethod,
      now,
    });

    try {
      // Claim durable: UNIQUE(user_id, idempotency_key) resuelve la concurrencia multi-pod.
      await this.operations.create(operation);
    } catch (error) {
      if (error instanceof DuplicateKeyError) {
        const existing = await this.operations.findByIdempotencyKey(
          command.userId,
          operation.idempotencyKey,
        );
        if (!existing) {
          throw error;
        }
        return this.processor.handleExisting(existing, now);
      }
      throw error;
    }

    return this.processor.charge(operation);
  }
}
