import { Module } from '@nestjs/common';
import { ReceiptsModule } from '../receipts/receipts.module';
import { LoansController } from './loans.controller';
import { LoansService } from './loans.service';

@Module({
  imports: [ReceiptsModule],
  controllers: [LoansController],
  providers: [LoansService],
  exports: [LoansService],
})
export class LoansModule {}
