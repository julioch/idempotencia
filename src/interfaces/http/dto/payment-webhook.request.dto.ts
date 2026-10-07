import { IsNotEmpty, IsString } from 'class-validator';

export class PaymentWebhookRequestDto {
  @IsString()
  @IsNotEmpty()
  provider_reference!: string;

  @IsString()
  @IsNotEmpty()
  operation_id!: string;

  @IsString()
  @IsNotEmpty()
  event_type!: string;

  @IsString()
  @IsNotEmpty()
  timestamp!: string;
}
