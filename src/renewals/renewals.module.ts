import { Module } from '@nestjs/common';
import { ReceiptsModule } from '../receipts/receipts.module';
import { RenewalsController } from './renewals.controller';
import { RenewalsService } from './renewals.service';

@Module({
  imports: [ReceiptsModule],
  controllers: [RenewalsController],
  providers: [RenewalsService],
})
export class RenewalsModule {}
