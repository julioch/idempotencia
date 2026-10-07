import { IOperationRepository } from '../ports/operation-repository.port';
import { CashInOutcome } from '../dto/cash-in.dto';
import { CashInProcessor } from '../services/cash-in.processor';

export class ReconcileOperationUseCase {
  constructor(
    private readonly operations: IOperationRepository,
    private readonly processor: CashInProcessor,
  ) {}

  async execute(operationId: string): Promise<CashInOutcome | null> {
    const operation = await this.operations.findById(operationId);
    if (!operation) {
      return null;
    }
    if (operation.isCompleted() || operation.isFailed()) {
      return {
        payload: this.processor.toPayload(operation),
        httpStatus: operation.isCompleted() ? 200 : 402,
      };
    }
    return this.processor.reconcile(operation);
  }
}
