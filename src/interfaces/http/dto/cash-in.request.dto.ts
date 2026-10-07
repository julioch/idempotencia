import { IsNotEmpty, IsNumber, IsPositive, IsString, Length } from 'class-validator';

export class CashInRequestDto {
  @IsString()
  @IsNotEmpty()
  user_id!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  amount!: number;

  @IsString()
  @Length(3, 3)
  currency!: string;

  @IsString()
  @IsNotEmpty()
  payment_method!: string;
}
