import { IsDateString, IsNumber, IsOptional, Min } from 'class-validator';

export class UpdateLoanDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  lateFeePerDay?: number;

  @IsOptional()
  @IsDateString()
  firstDueDate?: string;
}
