import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { LoanFrequency, LoanType } from '@prisma/client';

export class CreateLoanDto {
  @IsString()
  customerId!: string;

  @IsEnum(LoanType)
  type!: LoanType;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999999.99)
  principalAmount!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  installmentCount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999999.99)
  installmentAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001)
  @Max(100)
  monthlyInterestRate?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(9999999999999.99)
  monthlyInterestAmount?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9999999999999.99)
  lateFeePerDay!: number;

  @IsDateString()
  loanDate!: string;

  @IsOptional()
  @IsDateString()
  firstDueDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  monthlyDueDay?: number;

  @IsOptional()
  @IsEnum(LoanFrequency)
  frequency?: LoanFrequency;
}
