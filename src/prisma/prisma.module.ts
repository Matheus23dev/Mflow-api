import { Global, Module } from '@nestjs/common';
import { DatabaseUsageService } from '../common/database-usage.service';
import { PortfolioStatusService } from '../common/portfolio-status.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, PortfolioStatusService, DatabaseUsageService],
  exports: [PrismaService, PortfolioStatusService, DatabaseUsageService],
})
export class PrismaModule {}
