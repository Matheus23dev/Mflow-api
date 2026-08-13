import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
    const nextMonthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
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
    const activeWeekly = active.filter((loan) => loan.type === 'WEEKLY');
    const activeMonthly = active.filter(
      (loan) => loan.type === 'MONTHLY_INTEREST',
    );
    const monthlyLoansInOperation = loans.filter(
      (loan) =>
        loan.type === 'MONTHLY_INTEREST' && loan.status !== 'CANCELLED',
    );
    const isCurrentMonth = (value: Date) =>
      value >= monthStart && value < nextMonthStart;
    const openAmount = (
      amount: Prisma.Decimal.Value | null | undefined,
      paidAmount: Prisma.Decimal.Value | null | undefined,
    ) =>
      Math.max(0, numberOf(amount) - numberOf(paidAmount));

    const weeklyCapitalLent = activeWeekly.reduce(
      (sum, loan) => sum + numberOf(loan.principalAmount),
      0,
    );
    const weeklyTotalContracted = activeWeekly.reduce(
      (sum, loan) => sum + numberOf(loan.totalContracted),
      0,
    );
    const weeklyReceived = activeWeekly.reduce(
      (sum, loan) =>
        sum +
        loan.installments.reduce(
          (subtotal, item) => subtotal + numberOf(item.paidAmount),
          0,
        ),
      0,
    );
    const weeklyRemaining = activeWeekly.reduce(
      (sum, loan) =>
        sum +
        loan.installments.reduce(
          (subtotal, item) =>
            subtotal + openAmount(item.amount, item.paidAmount),
          0,
        ),
      0,
    );
    const weeklyOverdue = overdueCollections.filter(
      (item) => item.type === 'WEEKLY',
    );

    const monthlyCapitalLent = activeMonthly.reduce(
      (sum, loan) => sum + numberOf(loan.principalAmount),
      0,
    );
    const monthlyCapitalInCirculation = activeMonthly.reduce(
      (sum, loan) => sum + numberOf(loan.principalBalance),
      0,
    );
    const currentMonthlyCharges = monthlyLoansInOperation.flatMap((loan) =>
      loan.monthlyCharges.filter((charge) => isCurrentMonth(charge.dueDate)),
    );
    const monthlyInterestDue = currentMonthlyCharges.reduce(
      (sum, charge) => sum + numberOf(charge.interestAmount),
      0,
    );
    const monthlyInterestRemaining = currentMonthlyCharges.reduce(
      (sum, charge) =>
        sum + openAmount(charge.interestAmount, charge.paidAmount),
      0,
    );
    const monthlyPaymentsThisMonth = monthlyLoansInOperation.flatMap((loan) =>
      loan.payments.filter((payment) => isCurrentMonth(payment.paymentDate)),
    );
    const monthlyInterestReceived = monthlyPaymentsThisMonth
      .filter((payment) => payment.type === 'INTEREST')
      .reduce(
        (sum, payment) =>
          sum +
          Math.max(
            0,
            numberOf(payment.amount) - numberOf(payment.lateFeeAmount),
          ),
        0,
      );
    const monthlyPrincipalReturned = monthlyPaymentsThisMonth
      .filter((payment) => ['PRINCIPAL', 'PAYOFF'].includes(payment.type))
      .reduce((sum, payment) => sum + numberOf(payment.amount), 0);
    const monthlyPreviousInterestOverdue = activeMonthly.reduce(
      (sum, loan) =>
        sum +
        loan.monthlyCharges
          .filter((charge) => charge.dueDate < monthStart)
          .reduce(
            (subtotal, charge) =>
              subtotal +
              openAmount(charge.interestAmount, charge.paidAmount),
            0,
          ),
      0,
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
      portfolios: {
        weekly: {
          activeContracts: activeWeekly.length,
          capitalLent: weeklyCapitalLent,
          totalContracted: weeklyTotalContracted,
          received: weeklyReceived,
          remainingReceivable: weeklyRemaining,
          contractedProfit: Math.max(
            0,
            weeklyTotalContracted - weeklyCapitalLent,
          ),
          overdueAmount: weeklyOverdue.reduce(
            (sum, item) => sum + item.updatedAmount,
            0,
          ),
          overdueInstallments: weeklyOverdue.length,
          collectionRate:
            weeklyTotalContracted > 0
              ? Math.min(100, (weeklyReceived / weeklyTotalContracted) * 100)
              : 0,
        },
        monthlyInterest: {
          activeContracts: activeMonthly.length,
          capitalLent: monthlyCapitalLent,
          capitalInCirculation: monthlyCapitalInCirculation,
          interestDueThisMonth: monthlyInterestDue,
          interestReceivedThisMonth: monthlyInterestReceived,
          interestRemainingThisMonth: monthlyInterestRemaining,
          previousInterestOverdue: monthlyPreviousInterestOverdue,
          principalReturnedThisMonth: monthlyPrincipalReturned,
          monthlyYieldRate:
            monthlyCapitalInCirculation > 0
              ? (monthlyInterestReceived / monthlyCapitalInCirculation) * 100
              : 0,
        },
      },
      upcoming: upcoming.slice(0, 8),
    };
  }
}
