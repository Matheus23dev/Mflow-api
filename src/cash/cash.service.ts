import { BadRequestException, Injectable } from '@nestjs/common';
import { asUtcDate, startOfUtcDay, utcPeriod } from '../common/date.utils';
import { money, numberOf } from '../common/money.utils';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCashTransactionDto } from './dto/create-cash-transaction.dto';

@Injectable()
export class CashService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: string, from?: string, to?: string) {
    const dateFilter = from || to ? utcPeriod(from, to) : undefined;
    const transactions = await this.prisma.cashTransaction.findMany({
      where: {
        OR: [{ ownerId }, { loan: { customer: { ownerId } } }],
        ...(dateFilter ? { createdAt: dateFilter } : {}),
      },
      include: {
        loan: { include: { customer: { select: { id: true, name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const income = transactions
      .filter((item) => item.type === 'INCOME')
      .reduce((sum, item) => sum + numberOf(item.amount), 0);
    const expense = transactions
      .filter((item) => item.type === 'EXPENSE')
      .reduce((sum, item) => sum + numberOf(item.amount), 0);
    return {
      summary: { income, expense, balance: income - expense },
      transactions,
    };
  }

  create(ownerId: string, dto: CreateCashTransactionDto) {
    const transactionDate = asUtcDate(dto.transactionDate);
    if (startOfUtcDay(transactionDate) > startOfUtcDay()) {
      throw new BadRequestException(
        'A data da movimentação não pode estar no futuro.',
      );
    }

    return this.prisma.cashTransaction.create({
      data: {
        ownerId,
        type: dto.type,
        amount: money(dto.amount),
        description: dto.description.trim(),
        createdAt: transactionDate,
      },
    });
  }
}
