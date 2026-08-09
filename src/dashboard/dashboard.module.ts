import { Module } from '@nestjs/common';
import { CollectionsModule } from '../collections/collections.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [CollectionsModule],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
