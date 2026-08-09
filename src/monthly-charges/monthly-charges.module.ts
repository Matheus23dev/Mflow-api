import { Module } from '@nestjs/common';
import { MonthlyChargesController } from './monthly-charges.controller';
import { MonthlyChargesService } from './monthly-charges.service';

@Module({
  controllers: [MonthlyChargesController],
  providers: [MonthlyChargesService],
})
export class MonthlyChargesModule {}
