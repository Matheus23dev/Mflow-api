import { Module } from '@nestjs/common';
import { ReceiptStorageService } from './receipt-storage.service';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';

@Module({
  controllers: [ReceiptsController],
  providers: [ReceiptsService, ReceiptStorageService],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
