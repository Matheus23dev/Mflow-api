import { Injectable } from '@nestjs/common';
import { numberOf } from '../common/money.utils';
import { PortfolioStatusService } from '../common/portfolio-status.service';
import { CollectionsService } from '../collections/collections.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly collections: CollectionsService,
    private readonly portfolioStatus: PortfolioStatusService,
  ) {}

  async get(ownerId: string) {
    await this.portfolioStatus.refresh(ownerId);
    const now = new Date();
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const [
      loans,
      income,
      incomeMonth,
      activeCustomers,
      renewals,
      upcoming,
      overdueCollections,
    ] = await Promise.all([
      this.prisma.loan.findMany({
        where: { customer: { ownerId } },
        include: { installments: true, monthlyCharges: true, payments: true },
      }),
      this.prisma.cashTransaction.aggregate({
        where: { loan: { customer: { ownerId } }, type: 'INCOME' },
        _sum: { amount: true },
      }),
      this.prisma.cashTransaction.aggregate({
        where: {
          loan: { customer: { ownerId } },
          type: 'INCOME',
          createdAt: { gte: monthStart },
        },
        _sum: { amount: true },
      }),
      this.prisma.customer.count({
        where: {
          ownerId,
          loans: { some: { status: { in: ['ACTIVE', 'OVERDUE'] } } },
        },
      }),
      this.prisma.loan.count({
        where: { customer: { ownerId }, previousLoanId: { not: null } },
      }),
      this.collections.list(ownerId, 'week', false),
      this.collections.list(ownerId, 'overdue', false),
    ]);

    const active = loans.filter((loan) =>
      ['ACTIVE', 'OVERDUE'].includes(loan.status),
    );
    const capitalLent = active.reduce(
      (sum, loan) => sum + numberOf(loan.principalAmount),
      0,
    );
    const totalExpected = active.reduce((sum, loan) => {
      const openCharges = (
        loan.type === 'WEEKLY' ? loan.installments : loan.monthlyCharges
      ).reduce(
        (subtotal, item) =>
          subtotal +
          numberOf('amount' in item ? item.amount : item.interestAmount) -
          numberOf(item.paidAmount),
        0,
      );
      return (
        sum +
        openCharges +
        (loan.type === 'MONTHLY_INTEREST' ? numberOf(loan.principalBalance) : 0)
      );
    }, 0);
    const overdueAmount = overdueCollections.reduce(
      (sum, item) => sum + item.updatedAmount,
      0,
    );

    return {
      metrics: {
        capitalLent,
        totalExpected,
        totalReceived: numberOf(income._sum.amount),
        receivedThisMonth: numberOf(incomeMonth._sum.amount),
        openBalance: totalExpected,
        overdueAmount,
        activeCustomers,
        activeLoans: active.length,
        overdueLoans: active.filter((loan) => loan.status === 'OVERDUE').length,
        renewals,
      },
      upcoming: upcoming.slice(0, 8),
    };
  }
}
