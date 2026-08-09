import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LoanFrequency, Prisma } from '@prisma/client';
import { addFrequency, asUtcDate } from '../common/date.utils';
import { money } from '../common/money.utils';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRenewalDto } from './dto/create-renewal.dto';

@Injectable()
export class RenewalsService {
  constructor(private readonly prisma: PrismaService) {}

  list(ownerId: string) {
    return this.prisma.loan.findMany({
      where: { customer: { ownerId }, previousLoanId: { not: null } },
      include: {
        customer: { select: { name: true, phone: true } },
        previousLoan: { select: { id: true, totalContracted: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(ownerId: string, previousLoanId: string, dto: CreateRenewalDto) {
    const oldLoan = await this.prisma.loan.findFirst({
      where: { id: previousLoanId, customer: { ownerId } },
      include: { customer: true, installments: true },
    });
    if (!oldLoan) throw new NotFoundException('Empréstimo não encontrado.');
    if (
      oldLoan.type !== 'WEEKLY' ||
      !['ACTIVE', 'OVERDUE'].includes(oldLoan.status)
    ) {
      throw new BadRequestException(
        'Somente empréstimos semanais em andamento podem ser renovados.',
      );
    }
    const previousBalance = oldLoan.installments.reduce(
      (sum, item) => sum.add(item.amount.sub(item.paidAmount)),
      new Prisma.Decimal(0),
    );
    const entry = money(dto.entryAmount);
    if (entry.greaterThan(previousBalance))
      throw new BadRequestException('A entrada supera o saldo anterior.');
    const refinanced = previousBalance.sub(entry);
    const newMoney = money(dto.newMoneyReleased);
    const newBase = refinanced.add(newMoney);
    if (newBase.lessThanOrEqualTo(0))
      throw new BadRequestException(
        'A base do novo contrato deve ser positiva.',
      );
    const loanDate = asUtcDate(dto.loanDate);
    const firstDueDate = asUtcDate(dto.firstDueDate);
    if (firstDueDate < loanDate) {
      throw new BadRequestException(
        'O primeiro vencimento não pode ser anterior à renovação.',
      );
    }
    if (
      money(dto.installmentAmount).mul(dto.installmentCount).lessThan(newBase)
    ) {
      throw new BadRequestException(
        'O total do novo contrato não pode ser menor que o saldo refinanciado.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      if (entry.greaterThan(0)) {
        const payment = await tx.payment.create({
          data: {
            loanId: oldLoan.id,
            customerId: oldLoan.customerId,
            type: 'RENEWAL_ENTRY',
            amount: entry,
            paymentDate: loanDate,
            paymentMethod: dto.paymentMethod || 'PIX',
            notes: 'Entrada recebida na renovação',
          },
        });
        await tx.cashTransaction.create({
          data: {
            ownerId,
            type: 'INCOME',
            amount: entry,
            description: `Entrada da renovação de ${oldLoan.customer.name}`,
            loanId: oldLoan.id,
            paymentId: payment.id,
            createdAt: loanDate,
          },
        });
      }
      await tx.loan.update({
        where: { id: oldLoan.id },
        data: { status: 'RENEWED', principalBalance: 0 },
      });
      const loan = await tx.loan.create({
        data: {
          customerId: oldLoan.customerId,
          type: 'WEEKLY',
          frequency: dto.frequency || LoanFrequency.WEEKLY,
          principalAmount: newBase,
          principalBalance: newBase,
          releasedAmount: newMoney,
          totalContracted: money(dto.installmentAmount).mul(
            dto.installmentCount,
          ),
          installmentCount: dto.installmentCount,
          installmentAmount: money(dto.installmentAmount),
          lateFeePerDay: money(dto.lateFeePerDay),
          loanDate,
          firstDueDate,
          previousLoanId: oldLoan.id,
          previousBalance,
          renewalEntryAmount: entry,
          newMoneyReleased: newMoney,
          refinancedAmount: refinanced,
        },
      });
      await tx.installment.createMany({
        data: Array.from({ length: dto.installmentCount }, (_, index) => ({
          loanId: loan.id,
          number: index + 1,
          dueDate: addFrequency(
            firstDueDate,
            dto.frequency || LoanFrequency.WEEKLY,
            index,
          ),
          amount: money(dto.installmentAmount),
        })),
      });
      if (newMoney.greaterThan(0)) {
        await tx.cashTransaction.create({
          data: {
            ownerId,
            type: 'EXPENSE',
            amount: newMoney,
            description: `Dinheiro novo na renovação de ${oldLoan.customer.name}`,
            loanId: loan.id,
            createdAt: loanDate,
          },
        });
      }
      return tx.loan.findUniqueOrThrow({
        where: { id: loan.id },
        include: { installments: true, customer: true },
      });
    });
  }
}
