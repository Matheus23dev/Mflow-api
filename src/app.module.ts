import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { CashModule } from './cash/cash.module';
import { CollectionsModule } from './collections/collections.module';
import { CustomersModule } from './customers/customers.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { InstallmentsModule } from './installments/installments.module';
import { LoansModule } from './loans/loans.module';
import { MonthlyChargesModule } from './monthly-charges/monthly-charges.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { RenewalsModule } from './renewals/renewals.module';
import { ReportsModule } from './reports/reports.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    CustomersModule,
    LoansModule,
    InstallmentsModule,
    MonthlyChargesModule,
    PaymentsModule,
    RenewalsModule,
    CollectionsModule,
    CashModule,
    DashboardModule,
    ReportsModule,
    ReceiptsModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: JwtAuthGuard }],
})
export class AppModule {}
