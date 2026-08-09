import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { endOfUtcDay, overdueDays, startOfUtcDay } from '../common/date.utils';
import { numberOf } from '../common/money.utils';
import { PortfolioStatusService } from '../common/portfolio-status.service';
import { PrismaService } from '../prisma/prisma.service';

type CollectionFilter = 'today' | 'tomorrow' | 'week' | 'overdue' | '30days';

@Injectable()
export class CollectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolioStatus: PortfolioStatusService,
  ) {}

  async list(
    ownerId: string,
    filter: CollectionFilter = '30days',
    shouldRefresh = true,
  ) {
    if (shouldRefresh) await this.portfolioStatus.refresh(ownerId);
    const { from, to, overdueOnly } = this.range(filter);
    const baseWhere = {
      loan: {
        customer: { ownerId },
        status: { in: ['ACTIVE', 'OVERDUE'] as const },
      },
      status: { not: 'PAID' as const },
      dueDate: overdueOnly ? { lt: from } : { gte: from, lte: to },
    };
    const installmentWhere: Prisma.InstallmentWhereInput = {
      ...baseWhere,
      loan: { customer: { ownerId }, status: { in: ['ACTIVE', 'OVERDUE'] } },
    };
    const monthlyWhere: Prisma.MonthlyChargeWhereInput = {
      ...baseWhere,
      loan: { customer: { ownerId }, status: { in: ['ACTIVE', 'OVERDUE'] } },
    };
    const [installments, monthlyCharges] = await Promise.all([
      this.prisma.installment.findMany({
        where: installmentWhere,
        include: { loan: { include: { customer: true } } },
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.monthlyCharge.findMany({
        where: monthlyWhere,
        include: { loan: { include: { customer: true } } },
        orderBy: { dueDate: 'asc' },
      }),
    ]);
    const weekly = installments.map((item) =>
      this.present(
        item,
        item.amount,
        `Parcela ${item.number}/${item.loan.installmentCount}`,
      ),
    );
    const monthly = monthlyCharges.map((item) =>
      this.present(item, item.interestAmount, `Juros ${item.referenceMonth}`),
    );
    return [...weekly, ...monthly].sort(
      (a, b) => a.dueDate.getTime() - b.dueDate.getTime(),
    );
  }

  private present(
    item: {
      id: string;
      dueDate: Date;
      paidAmount: Prisma.Decimal;
      status: string;
      loan: {
        id: string;
        type: string;
        lateFeePerDay: Prisma.Decimal;
        customer: { id: string; name: string; phone: string };
      };
    },
    original: Prisma.Decimal,
    label: string,
  ) {
    const days = overdueDays(item.dueDate);
    const lateFee = Number(
      (days * numberOf(item.loan.lateFeePerDay)).toFixed(2),
    );
    const outstanding = numberOf(original) - numberOf(item.paidAmount);
    return {
      id: item.id,
      loanId: item.loan.id,
      customer: item.loan.customer,
      type: item.loan.type,
      label,
      dueDate: item.dueDate,
      originalAmount: numberOf(original),
      paidAmount: numberOf(item.paidAmount),
      outstanding,
      daysOverdue: days,
      lateFee,
      updatedAmount: outstanding + lateFee,
      status: days > 0 ? 'OVERDUE' : item.status,
    };
  }

  private range(filter: CollectionFilter) {
    const from = startOfUtcDay();
    const to = new Date(from);
    if (filter === 'tomorrow') {
      from.setUTCDate(from.getUTCDate() + 1);
      to.setUTCDate(to.getUTCDate() + 1);
    }
    if (filter === 'week') to.setUTCDate(to.getUTCDate() + 7);
    if (filter === '30days') to.setUTCDate(to.getUTCDate() + 30);
    if (filter === 'today' || filter === 'tomorrow') {
      return { from, to: endOfUtcDay(to), overdueOnly: false };
    }
    return {
      from,
      to: endOfUtcDay(to),
      overdueOnly: filter === 'overdue',
    };
  }
}
