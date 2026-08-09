import { Injectable } from '@nestjs/common';
import { numberOf } from './money.utils';
import { startOfUtcDay } from './date.utils';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PortfolioStatusService {
  constructor(private readonly prisma: PrismaService) {}

  async refresh(ownerId: string) {
    const today = startOfUtcDay();

    await this.prisma.$transaction(async (tx) => {
      await Promise.all([
        tx.installment.updateMany({
          where: {
            loan: {
              customer: { ownerId },
              status: { in: ['ACTIVE', 'OVERDUE'] },
            },
            dueDate: { lt: today },
            status: { in: ['PENDING', 'PARTIAL'] },
          },
          data: { status: 'OVERDUE' },
        }),
        tx.monthlyCharge.updateMany({
          where: {
            loan: {
              customer: { ownerId },
              status: { in: ['ACTIVE', 'OVERDUE'] },
            },
            dueDate: { lt: today },
            status: { in: ['PENDING', 'PARTIAL'] },
          },
          data: { status: 'OVERDUE' },
        }),
      ]);

      const [rescheduledInstallments, rescheduledCharges] = await Promise.all([
        tx.installment.findMany({
          where: {
            loan: { customer: { ownerId } },
            dueDate: { gte: today },
            status: 'OVERDUE',
          },
          select: { id: true, paidAmount: true },
        }),
        tx.monthlyCharge.findMany({
          where: {
            loan: { customer: { ownerId } },
            dueDate: { gte: today },
            status: 'OVERDUE',
          },
          select: { id: true, paidAmount: true },
        }),
      ]);

      for (const item of rescheduledInstallments) {
        await tx.installment.update({
          where: { id: item.id },
          data: {
            status: numberOf(item.paidAmount) > 0 ? 'PARTIAL' : 'PENDING',
          },
        });
      }
      for (const item of rescheduledCharges) {
        await tx.monthlyCharge.update({
          where: { id: item.id },
          data: {
            status: numberOf(item.paidAmount) > 0 ? 'PARTIAL' : 'PENDING',
          },
        });
      }

      await tx.loan.updateMany({
        where: {
          customer: { ownerId },
          status: 'ACTIVE',
          OR: [
            { installments: { some: { status: 'OVERDUE' } } },
            { monthlyCharges: { some: { status: 'OVERDUE' } } },
          ],
        },
        data: { status: 'OVERDUE' },
      });

      await tx.loan.updateMany({
        where: {
          customer: { ownerId },
          status: 'OVERDUE',
          installments: { none: { status: 'OVERDUE' } },
          monthlyCharges: { none: { status: 'OVERDUE' } },
        },
        data: { status: 'ACTIVE' },
      });
    });
  }
}
