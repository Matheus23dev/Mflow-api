import { ReceiptKind } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateReceiptDto {
  @IsEnum(ReceiptKind)
  kind: ReceiptKind;

  @IsOptional()
  @IsString()
  paymentId?: string;
}
