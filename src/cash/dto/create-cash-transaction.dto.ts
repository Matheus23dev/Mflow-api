import { CashTransactionType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCashTransactionDto {
  @IsEnum(CashTransactionType)
  type!: CashTransactionType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999999.99)
  amount!: number;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  description!: string;

  @IsDateString()
  transactionDate!: string;
}
