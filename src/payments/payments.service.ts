import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaymentType, Prisma } from '@prisma/client';
import {
  asUtcDate,
  monthlyDueDate,
  overdueDays,
  referenceMonth,
  startOfUtcDay,
} from '../common/date.utils';
import { money } from '../common/money.utils';
import { PortfolioStatusService } from '../common/portfolio-status.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolioStatus: PortfolioStatusService,
    private readonly receipts: ReceiptsService,
  ) {}

  list(ownerId: string, loanId?: string, customerId?: string) {
    return this.prisma.payment.findMany({
      where: {
        customer: { ownerId },
        ...(loanId ? { loanId } : {}),
        ...(customerId ? { customerId } : {}),
      },
      include: {
        customer: { select: { id: true, name: true } },
        loan: { select: { id: true, type: true } },
        installment: { select: { number: true, dueDate: true } },
        monthlyCharge: { select: { referenceMonth: true, dueDate: true } },
      },
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async create(ownerId: string, dto: CreatePaymentDto) {
    const paymentDate = asUtcDate(dto.paymentDate);
    if (startOfUtcDay(paymentDate) > startOfUtcDay()) {
      throw new BadRequestException(
        'A data do pagamento não pode estar no futuro.',
      );
    }

    await this.portfolioStatus.refresh(ownerId);

    const result = await this.prisma.$transaction(async (tx) => {
      const loan = await tx.loan.findFirst({
        where: { id: dto.loanId, customer: { ownerId } },
        include: { customer: true },
      });
      if (!loan) throw new NotFoundException('Empréstimo não encontrado.');
      if (!['ACTIVE', 'OVERDUE'].includes(loan.status)) {
        throw new BadRequestException(
          'O contrato não está disponível para pagamentos.',
        );
      }

      const paymentAmount = money(dto.amount);
      let lateFeeAmount = money(0);
      let installmentId: string | null = null;
      let monthlyChargeId: string | null = null;

      if (dto.type === PaymentType.INSTALLMENT) {
        if (!dto.installmentId) {
          throw new BadRequestException('Selecione uma parcela.');
        }
        const item = await tx.installment.findFirst({
          where: { id: dto.installmentId, loanId: loan.id },
        });
        if (!item) throw new NotFoundException('Parcela não encontrada.');
        if (item.status === 'PAID') {
          throw new BadRequestException('Esta parcela já foi paga.');
        }

        const outstanding = item.amount.sub(item.paidAmount);
        const fee = this.lateFeeFor(
          item.dueDate,
          paymentDate,
          loan.lateFeePerDay,
          dto.waiveLateFee,
        );
        const parts = this.paymentParts(paymentAmount, outstanding, fee);
        const paidAmount = item.paidAmount.add(parts.baseApplied);

        await tx.installment.update({
          where: { id: item.id },
          data: {
            paidAmount,
            status: parts.closesCharge
              ? 'PAID'
              : overdueDays(item.dueDate) > 0
                ? 'OVERDUE'
                : 'PARTIAL',
            paidAt: parts.closesCharge ? paymentDate : null,
          },
        });

        const capitalRatio = loan.totalContracted.greaterThan(0)
          ? loan.principalAmount.div(loan.totalContracted)
          : money(0);
        const recoveredCapital = Prisma.Decimal.min(
          parts.baseApplied.mul(capitalRatio),
          loan.principalBalance,
        );
        const remainingCapital = Prisma.Decimal.max(
          money(0),
          loan.principalBalance.sub(recoveredCapital),
        );

        const [remaining, hasOverdue] = await Promise.all([
          tx.installment.count({
            where: { loanId: loan.id, status: { not: 'PAID' } },
          }),
          tx.installment.count({
            where: { loanId: loan.id, status: 'OVERDUE' },
          }),
        ]);
        await tx.loan.update({
          where: { id: loan.id },
          data: {
            principalBalance: remaining === 0 ? 0 : remainingCapital,
            status:
              remaining === 0 ? 'PAID' : hasOverdue ? 'OVERDUE' : 'ACTIVE',
          },
        });

        installmentId = item.id;
        lateFeeAmount = parts.lateFeeApplied;
      } else if (dto.type === PaymentType.INTEREST) {
        if (!dto.monthlyChargeId) {
          throw new BadRequestException('Selecione uma cobrança mensal.');
        }
        const charge = await tx.monthlyCharge.findFirst({
          where: { id: dto.monthlyChargeId, loanId: loan.id },
        });
        if (!charge) {
          throw new NotFoundException('Cobrança mensal não encontrada.');
        }
        if (charge.status === 'PAID') {
          throw new BadRequestException('Esta cobrança já foi paga.');
        }

        const outstanding = charge.interestAmount.sub(charge.paidAmount);
        const fee = this.lateFeeFor(
          charge.dueDate,
          paymentDate,
          loan.lateFeePerDay,
          dto.waiveLateFee,
        );
        const parts = this.paymentParts(paymentAmount, outstanding, fee);
        const paidAmount = charge.paidAmount.add(parts.baseApplied);

        await tx.monthlyCharge.update({
          where: { id: charge.id },
          data: {
            paidAmount,
            status: parts.closesCharge
              ? 'PAID'
              : overdueDays(charge.dueDate) > 0
                ? 'OVERDUE'
                : 'PARTIAL',
            paidAt: parts.closesCharge ? paymentDate : null,
          },
        });

        monthlyChargeId = charge.id;
        lateFeeAmount = parts.lateFeeApplied;

        if (parts.closesCharge && loan.principalBalance.greaterThan(0)) {
          const nextDue = monthlyDueDate(
            charge.dueDate,
            loan.monthlyDueDay || charge.dueDate.getUTCDate(),
            1,
          );
          const nextInterest = loan.monthlyInterestRate
            ? loan.principalBalance
                .mul(loan.monthlyInterestRate)
                .div(100)
                .toDecimalPlaces(2)
            : loan.monthlyInterestAmount!;
          await tx.monthlyCharge.upsert({
            where: {
              loanId_referenceMonth: {
                loanId: loan.id,
                referenceMonth: referenceMonth(nextDue),
              },
            },
            update: {},
            create: {
              loanId: loan.id,
              referenceMonth: referenceMonth(nextDue),
              dueDate: nextDue,
              interestAmount: nextInterest,
            },
          });
        }

        await this.updateMonthlyLoanStatus(tx, loan.id, loan.principalBalance);
      } else if (
        (dto.type === PaymentType.PRINCIPAL ||
          dto.type === PaymentType.PAYOFF) &&
        loan.type === 'MONTHLY_INTEREST'
      ) {
        if (paymentAmount.greaterThan(loan.principalBalance)) {
          throw new BadRequestException('O valor supera o saldo principal.');
        }
        if (
          dto.type === PaymentType.PAYOFF &&
          !paymentAmount.equals(loan.principalBalance)
        ) {
          throw new BadRequestException(
            `Para quitar, informe exatamente R$ ${loan.principalBalance.toFixed(2)}.`,
          );
        }

        const openCharges = await tx.monthlyCharge.count({
          where: { loanId: loan.id, status: { not: 'PAID' } },
        });
        if (dto.type === PaymentType.PAYOFF && openCharges > 0) {
          throw new BadRequestException(
            'Quite primeiro os juros mensais pendentes antes de encerrar o principal.',
          );
        }

        const balance = loan.principalBalance.sub(paymentAmount);
        await tx.loan.update({
          where: { id: loan.id },
          data: {
            principalBalance: balance,
            status:
              balance.equals(0) && openCharges === 0 ? 'PAID' : loan.status,
          },
        });
      } else if (dto.type === PaymentType.PAYOFF && loan.type === 'WEEKLY') {
        const installments = await tx.installment.findMany({
          where: { loanId: loan.id, status: { not: 'PAID' } },
          orderBy: { number: 'asc' },
        });
        const outstanding = installments.reduce(
          (sum, item) => sum.add(item.amount.sub(item.paidAmount)),
          money(0),
        );
        const fees = installments.reduce(
          (sum, item) =>
            sum.add(
              money(overdueDays(item.dueDate, paymentDate)).mul(
                loan.lateFeePerDay,
              ),
            ),
          money(0),
        );
        const payoff = outstanding.add(fees);
        if (!paymentAmount.equals(payoff)) {
          throw new BadRequestException(
            `Para quitar, informe exatamente R$ ${payoff.toFixed(2)}.`,
          );
        }
        for (const item of installments) {
          await tx.installment.update({
            where: { id: item.id },
            data: {
              paidAmount: item.amount,
              status: 'PAID',
              paidAt: paymentDate,
            },
          });
        }
        await tx.loan.update({
          where: { id: loan.id },
          data: { status: 'PAID', principalBalance: 0 },
        });
        lateFeeAmount = fees;
      } else {
        throw new BadRequestException(
          'Tipo de pagamento incompatível com o contrato.',
        );
      }

      const payment = await tx.payment.create({
        data: {
          loanId: loan.id,
          customerId: loan.customerId,
          installmentId,
          monthlyChargeId,
          type: dto.type,
          amount: paymentAmount,
          lateFeeAmount,
          paymentDate,
          paymentMethod: dto.paymentMethod,
          notes: dto.notes?.trim() || null,
        },
      });
      await tx.cashTransaction.create({
        data: {
          ownerId,
          type: 'INCOME',
          amount: paymentAmount,
          description: `Pagamento de ${loan.customer.name}`,
          loanId: loan.id,
          paymentId: payment.id,
          createdAt: paymentDate,
        },
      });

      const currentLoan = await tx.loan.findUniqueOrThrow({
        where: { id: loan.id },
        select: { status: true },
      });
      return { ...payment, loanStatus: currentLoan.status };
    });

    if (!['ACTIVE', 'OVERDUE'].includes(result.loanStatus)) {
      await this.receipts.purgePaymentReceipts(ownerId, dto.loanId, true);
    }
    return result;
  }

  private paymentParts(
    payment: Prisma.Decimal,
    outstanding: Prisma.Decimal,
    fee: Prisma.Decimal,
  ) {
    const total = outstanding.add(fee);
    if (payment.greaterThan(total)) {
      throw new BadRequestException('O valor supera a cobrança atualizada.');
    }
    if (
      fee.greaterThan(0) &&
      payment.greaterThan(outstanding) &&
      !payment.equals(total)
    ) {
      throw new BadRequestException(
        `Para concluir a cobrança com multa, informe R$ ${total.toFixed(2)}.`,
      );
    }

    const closesCharge = payment.equals(total);
    return {
      closesCharge,
      baseApplied: closesCharge
        ? outstanding
        : Prisma.Decimal.min(payment, outstanding),
      lateFeeApplied: closesCharge ? fee : money(0),
    };
  }

  private lateFeeFor(
    dueDate: Date,
    paymentDate: Date,
    lateFeePerDay: Prisma.Decimal,
    waiveLateFee = false,
  ) {
    if (waiveLateFee) return money(0);
    return money(overdueDays(dueDate, paymentDate)).mul(lateFeePerDay);
  }

  private async updateMonthlyLoanStatus(
    tx: Prisma.TransactionClient,
    loanId: string,
    principalBalance: Prisma.Decimal,
  ) {
    const [openCharges, overdueCharges] = await Promise.all([
      tx.monthlyCharge.count({
        where: { loanId, status: { not: 'PAID' } },
      }),
      tx.monthlyCharge.count({ where: { loanId, status: 'OVERDUE' } }),
    ]);
    await tx.loan.update({
      where: { id: loanId },
      data: {
        status:
          principalBalance.equals(0) && openCharges === 0
            ? 'PAID'
            : overdueCharges > 0
              ? 'OVERDUE'
              : 'ACTIVE',
      },
    });
  }
}
