import { LoanFrequency, PaymentMethod } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  Max,
  Min,
} from 'class-validator';

export class CreateRenewalDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999999.99)
  entryAmount!: number;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999999.99)
  newMoneyReleased!: number;
  @IsInt() @Min(1) @Max(1000) installmentCount!: number;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999999.99)
  installmentAmount!: number;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999999.99)
  lateFeePerDay!: number;
  @IsDateString() loanDate!: string;
  @IsDateString() firstDueDate!: string;
  @IsOptional() @IsEnum(LoanFrequency) frequency?: LoanFrequency;
  @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
}
