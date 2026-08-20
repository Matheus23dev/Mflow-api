import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCustomerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(30)
  phone?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  cpf?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(191)
  address?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notes?: string | null;
}
