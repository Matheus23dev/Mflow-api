import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { monthlyDueDate, referenceMonth } from '../common/date.utils';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MonthlyChargesService {
  constructor(private readonly prisma: PrismaService) {}

  async byLoan(ownerId: string, loanId: string) {
    await this.ensure(ownerId, loanId);
    return this.prisma.monthlyCharge.findMany({
      where: { loanId },
      orderBy: { dueDate: 'asc' },
    });
  }

  async generateNext(ownerId: string, loanId: string) {
    const loan = await this.ensure(ownerId, loanId);
    if (
      loan.type !== 'MONTHLY_INTEREST' ||
      !['ACTIVE', 'OVERDUE'].includes(loan.status) ||
      loan.principalBalance.equals(0)
    ) {
      throw new BadRequestException('Não há nova cobrança mensal a gerar.');
    }
    const latest = await this.prisma.monthlyCharge.findFirst({
      where: { loanId },
      orderBy: { dueDate: 'desc' },
    });
    if (!latest)
      throw new BadRequestException('O contrato não possui cobrança inicial.');
    const nextDue = monthlyDueDate(
      latest.dueDate,
      loan.monthlyDueDay || latest.dueDate.getUTCDate(),
      1,
    );
    const interestAmount = loan.monthlyInterestRate
      ? loan.principalBalance
          .mul(loan.monthlyInterestRate)
          .div(100)
          .toDecimalPlaces(2)
      : loan.monthlyInterestAmount!;
    return this.prisma.monthlyCharge.upsert({
      where: {
        loanId_referenceMonth: {
          loanId,
          referenceMonth: referenceMonth(nextDue),
        },
      },
      update: {},
      create: {
        loanId,
        referenceMonth: referenceMonth(nextDue),
        dueDate: nextDue,
        interestAmount,
      },
    });
  }

  private async ensure(ownerId: string, loanId: string) {
    const loan = await this.prisma.loan.findFirst({
      where: { id: loanId, customer: { ownerId } },
    });
    if (!loan) throw new NotFoundException('Empréstimo não encontrado.');
    return loan;
  }
}
