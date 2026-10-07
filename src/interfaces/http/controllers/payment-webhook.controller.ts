import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { HandlePaymentWebhookUseCase } from '../../../core/application/use-cases/handle-payment-webhook.use-case';
import { PaymentWebhookRequestDto } from '../dto/payment-webhook.request.dto';
import { HmacSignatureGuard } from '../guards/hmac-signature.guard';

@Controller('webhooks')
export class PaymentWebhookController {
  constructor(private readonly handlePaymentWebhook: HandlePaymentWebhookUseCase) {}

  @Post('payment')
  @UseGuards(HmacSignatureGuard)
  @HttpCode(HttpStatus.OK)
  async handle(@Body() dto: PaymentWebhookRequestDto) {
    await this.handlePaymentWebhook.execute({
      providerReference: dto.provider_reference,
      operationId: dto.operation_id,
      eventType: dto.event_type,
      timestamp: dto.timestamp,
      raw: dto as unknown as Record<string, unknown>,
    });
    return { received: true };
  }
}
