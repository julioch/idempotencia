import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Headers,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { InitiateCashInUseCase } from '../../../core/application/use-cases/initiate-cash-in.use-case';
import { OperationInProgressError } from '../../../core/application/errors/application.errors';
import { IdempotencyKey } from '../../../core/domain/value-objects/idempotency-key';
import { CashInRequestDto } from '../dto/cash-in.request.dto';

@Controller('cash-in')
export class CashInController {
  constructor(private readonly initiateCashIn: InitiateCashInUseCase) {}

  @Post()
  async create(
    @Headers('idempotency-key') idempotencyKey: string,
    @Body() dto: CashInRequestDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!idempotencyKey) {
      throw new BadRequestException('Falta el header Idempotency-Key');
    }
    try {
      IdempotencyKey.from(idempotencyKey);
    } catch {
      throw new BadRequestException('El header Idempotency-Key debe ser un UUID válido');
    }

    try {
      const outcome = await this.initiateCashIn.execute({
        userId: dto.user_id,
        amount: dto.amount,
        currency: dto.currency,
        paymentMethod: dto.payment_method,
        idempotencyKey,
      });
      res.status(outcome.httpStatus);
      return outcome.payload;
    } catch (error) {
      if (error instanceof OperationInProgressError) {
        throw new ConflictException({
          operation_id: error.operationId,
          status: 'in_progress',
        });
      }
      throw error;
    }
  }
}
