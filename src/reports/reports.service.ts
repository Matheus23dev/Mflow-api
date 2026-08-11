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
    const allocations = paymentsInPeriod.reduce(
      (totals, payment) => {
        const baseAmount =
          numberOf(payment.amount) - numberOf(payment.lateFeeAmount);
        if (payment.type === 'INTEREST') {
          totals.interest += baseAmount;
          return totals;
        }
        if (payment.type === 'PRINCIPAL' || payment.type === 'RENEWAL_ENTRY') {
          totals.capital += baseAmount;
          return totals;
        }
        if (
          ['INSTALLMENT', 'PAYOFF'].includes(payment.type) &&
          payment.loan.type === 'WEEKLY' &&
          numberOf(payment.loan.totalContracted) > 0
        ) {
          const capitalRatio =
            numberOf(payment.loan.principalAmount) /
            numberOf(payment.loan.totalContracted);
          totals.capital += baseAmount * capitalRatio;
          totals.interest += baseAmount * (1 - capitalRatio);
          return totals;
        }
        if (payment.type === 'PAYOFF') {
          totals.capital += baseAmount;
        }
        return totals;
      },
      { capital: 0, interest: 0 },
    );
    const capitalRecovered = allocations.capital;
    const interestReceived = allocations.interest;
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
