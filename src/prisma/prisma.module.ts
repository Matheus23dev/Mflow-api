import { Global, Module } from '@nestjs/common';
import { PortfolioStatusService } from '../common/portfolio-status.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, PortfolioStatusService],
  exports: [PrismaService, PortfolioStatusService],
})
export class PrismaModule {}
