import { Injectable } from '@nestjs/common';
import { overdueDays, utcPeriod } from '../common/date.utils';
import { numberOf } from '../common/money.utils';
import { PortfolioStatusService } from '../common/portfolio-status.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolioStatus: PortfolioStatusService,
  ) {}

  async get(ownerId: string, from?: string, to?: string) {
    await this.portfolioStatus.refresh(ownerId);
    const period = utcPeriod(from, to);
    const [loansInPeriod, paymentsInPeriod, activeLoans] = await Promise.all([
      this.prisma.loan.findMany({
        where: {
          customer: { ownerId },
          ...(from || to ? { loanDate: period } : {}),
        },
      }),
      this.prisma.payment.findMany({
        where: {
          customer: { ownerId },
          ...(from || to ? { paymentDate: period } : {}),
        },
        include: { loan: true },
      }),
      this.prisma.loan.findMany({
        where: { customer: { ownerId }, status: { in: ['ACTIVE', 'OVERDUE'] } },
        include: { installments: true, monthlyCharges: true },
      }),
    ]);
    const totalLent = loansInPeriod.reduce(
      (sum, loan) => sum + numberOf(loan.releasedAmount),
      0,
    );
    const totalReceived = paymentsInPeriod.reduce(
      (sum, payment) => sum + numberOf(payment.amount),
      0,
    );
    const interestReceived = paymentsInPeriod
      .filter((payment) => payment.type === 'INTEREST')
      .reduce(
        (sum, payment) =>
          sum + numberOf(payment.amount) - numberOf(payment.lateFeeAmount),
        0,
      );
    const capitalRecovered = paymentsInPeriod.reduce((sum, payment) => {
      const baseAmount =
        numberOf(payment.amount) - numberOf(payment.lateFeeAmount);
      if (payment.type === 'PRINCIPAL') return sum + baseAmount;
      if (
        ['INSTALLMENT', 'PAYOFF', 'RENEWAL_ENTRY'].includes(payment.type) &&
        payment.loan.type === 'WEEKLY' &&
        numberOf(payment.loan.totalContracted) > 0
      ) {
        return (
          sum +
          baseAmount *
            (numberOf(payment.loan.principalAmount) /
              numberOf(payment.loan.totalContracted))
        );
      }
      if (payment.type === 'PAYOFF') {
        return sum + baseAmount;
      }
      return sum;
    }, 0);
    const openBalance = activeLoans.reduce((sum, loan) => {
      const charges = (
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
        charges +
        (loan.type === 'MONTHLY_INTEREST' ? numberOf(loan.principalBalance) : 0)
      );
    }, 0);
    const overdue = activeLoans.reduce(
      (sum, loan) =>
        sum +
        [...loan.installments, ...loan.monthlyCharges]
          .filter((item) => item.status === 'OVERDUE')
          .reduce(
            (subtotal, item) =>
              subtotal +
              numberOf('amount' in item ? item.amount : item.interestAmount) -
              numberOf(item.paidAmount) +
              overdueDays(item.dueDate) * numberOf(loan.lateFeePerDay),
            0,
          ),
      0,
    );
    const projectedProfit = activeLoans
      .filter(
        (loan) => loan.type === 'WEEKLY' && numberOf(loan.totalContracted) > 0,
      )
      .reduce((sum, loan) => {
        const openInstallments = loan.installments.reduce(
          (subtotal, item) =>
            subtotal + numberOf(item.amount) - numberOf(item.paidAmount),
          0,
        );
        const profitRatio =
          (numberOf(loan.totalContracted) - numberOf(loan.principalAmount)) /
          numberOf(loan.totalContracted);
        return sum + openInstallments * profitRatio;
      }, 0);
    return {
      period: { from: from || null, to: to || null },
      metrics: {
        totalLent,
        totalReceived,
        interestReceived,
        capitalRecovered,
        openBalance,
        overdue,
        realizedProfit: totalReceived - capitalRecovered,
        projectedProfit,
      },
    };
  }
}
