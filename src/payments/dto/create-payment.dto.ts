import { PaymentMethod, PaymentType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePaymentDto {
  @IsString()
  loanId!: string;

  @IsOptional()
  @IsString()
  installmentId?: string;

  @IsOptional()
  @IsString()
  monthlyChargeId?: string;

  @IsEnum(PaymentType)
  type!: PaymentType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999999.99)
  amount!: number;

  @IsDateString()
  paymentDate!: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
