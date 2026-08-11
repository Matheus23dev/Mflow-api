import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LoanFrequency, LoanStatus, LoanType, Prisma } from '@prisma/client';
import {
  addFrequency,
  asUtcDate,
  monthlyDueDate,
  overdueDays,
  referenceMonth,
} from '../common/date.utils';
import { money, numberOf } from '../common/money.utils';
import { PortfolioStatusService } from '../common/portfolio-status.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiptsService } from '../receipts/receipts.service';
import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto } from './dto/update-loan.dto';

const loanInclude = {
  customer: {
    select: { id: true, name: true, phone: true, cpf: true, address: true },
  },
  installments: { orderBy: { number: 'asc' as const } },
  monthlyCharges: { orderBy: { dueDate: 'asc' as const } },
  payments: { orderBy: { paymentDate: 'desc' as const } },
  previousLoan: { select: { id: true } },
  renewedLoan: { select: { id: true } },
  receipts: {
    select: {
      id: true,
      loanId: true,
      paymentId: true,
      kind: true,
      originalName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
  },
};

type LoanWithDetails = Prisma.LoanGetPayload<{ include: typeof loanInclude }>;

@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolioStatus: PortfolioStatusService,
    private readonly receipts: ReceiptsService,
  ) {}

  async list(ownerId: string, status?: LoanStatus, type?: LoanType) {
    await this.portfolioStatus.refresh(ownerId);
    const loans = await this.prisma.loan.findMany({
      where: {
        customer: { ownerId },
        ...(status ? { status } : {}),
        ...(type ? { type } : {}),
      },
      include: loanInclude,
      orderBy: { createdAt: 'desc' },
    });
    return loans.map((loan) => this.withSummary(loan));
  }

  async findOne(ownerId: string, id: string) {
    await this.portfolioStatus.refresh(ownerId);
    const loan = await this.prisma.loan.findFirst({
      where: { id, customer: { ownerId } },
      include: loanInclude,
    });
    if (!loan) throw new NotFoundException('Empréstimo não encontrado.');
    return this.withSummary(loan);
  }

  async create(ownerId: string, dto: CreateLoanDto) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, ownerId },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado.');
    this.validate(dto);

    return this.prisma
      .$transaction(async (tx) => {
        const principal = money(dto.principalAmount);
        const released = principal;
        const isWeekly = dto.type === LoanType.WEEKLY;
        const interestAmount = isWeekly
          ? null
          : money(
              dto.monthlyInterestAmount ??
                principal.mul(dto.monthlyInterestRate!).div(100),
            );
        const totalContracted = isWeekly
          ? money(dto.installmentAmount!).mul(dto.installmentCount!)
          : principal;
        const loanDate = asUtcDate(dto.loanDate);
        const firstDueDate = isWeekly
          ? asUtcDate(dto.firstDueDate!)
          : monthlyDueDate(loanDate, dto.monthlyDueDay!);

        const loan = await tx.loan.create({
          data: {
            customerId: dto.customerId,
            type: dto.type,
            frequency: isWeekly
              ? dto.frequency || LoanFrequency.WEEKLY
              : LoanFrequency.MONTHLY,
            principalAmount: principal,
            principalBalance: principal,
            releasedAmount: released,
            totalContracted,
            installmentCount: isWeekly ? dto.installmentCount : null,
            installmentAmount: isWeekly ? money(dto.installmentAmount!) : null,
            monthlyInterestRate: dto.monthlyInterestRate
              ? money(dto.monthlyInterestRate)
              : null,
            monthlyInterestAmount: interestAmount,
            lateFeePerDay: money(dto.lateFeePerDay),
            loanDate,
            firstDueDate,
            monthlyDueDay: isWeekly ? null : dto.monthlyDueDay,
          },
        });

        if (isWeekly) {
          await tx.installment.createMany({
            data: Array.from({ length: dto.installmentCount! }, (_, index) => ({
              loanId: loan.id,
              number: index + 1,
              dueDate: addFrequency(
                firstDueDate,
                dto.frequency || LoanFrequency.WEEKLY,
                index,
              ),
              amount: money(dto.installmentAmount!),
            })),
          });
        } else {
          await tx.monthlyCharge.create({
            data: {
              loanId: loan.id,
              referenceMonth: referenceMonth(firstDueDate),
              dueDate: firstDueDate,
              interestAmount: interestAmount!,
            },
          });
        }

        await tx.cashTransaction.create({
          data: {
            ownerId,
            type: 'EXPENSE',
            amount: released,
            description: `Liberação de empréstimo para ${customer.name}`,
            loanId: loan.id,
            createdAt: loanDate,
          },
        });
        return tx.loan.findUniqueOrThrow({
          where: { id: loan.id },
          include: loanInclude,
        });
      })
      .then((loan) => this.withSummary(loan));
  }

  async update(ownerId: string, id: string, dto: UpdateLoanDto) {
    const loan = await this.ensureOwner(ownerId, id);
    if (!['ACTIVE', 'OVERDUE'].includes(loan.status)) {
      throw new BadRequestException(
        'Somente contratos em andamento podem ser editados.',
      );
    }

    const principalAmount = dto.principalAmount
      ? money(dto.principalAmount)
      : loan.principalAmount;
    const principalBalance =
      dto.principalBalance !== undefined
        ? money(dto.principalBalance)
        : dto.principalAmount !== undefined
          ? money(dto.principalAmount)
          : loan.principalBalance;

    if (loan.type === LoanType.WEEKLY) {
      const firstDue = dto.firstDueDate
        ? asUtcDate(dto.firstDueDate)
        : loan.firstDueDate!;
      const frequency = dto.frequency || loan.frequency || LoanFrequency.WEEKLY;
      const installmentCount = dto.installmentCount ?? loan.installmentCount!;
      const installmentAmount = dto.installmentAmount
        ? money(dto.installmentAmount)
        : loan.installmentAmount!;

      if (firstDue < loan.loanDate) {
        throw new BadRequestException(
          'O primeiro vencimento não pode ser anterior ao empréstimo.',
        );
      }

      const existingInstallments = await this.prisma.installment.findMany({
        where: { loanId: id },
        orderBy: { number: 'asc' },
      });

      const paidInstallments = existingInstallments.filter(
        (inst) => inst.status === 'PAID' || numberOf(inst.paidAmount) > 0,
      );

      if (installmentCount < paidInstallments.length) {
        throw new BadRequestException(
          `Não é possível definir quantidade de parcelas menor que o número de parcelas já pagas (${paidInstallments.length}).`,
        );
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.installment.deleteMany({
          where: {
            loanId: id,
            paidAmount: 0,
            status: { not: 'PAID' },
          },
        });

        const paidNumbers = paidInstallments.map((inst) => inst.number);
        const maxPaidNumber =
          paidNumbers.length > 0 ? Math.max(...paidNumbers) : 0;
        const startNumber = maxPaidNumber + 1;

        const newInstallmentsData: Array<{
          loanId: string;
          number: number;
          dueDate: Date;
          amount: Prisma.Decimal;
        }> = [];
        for (let i = startNumber; i <= installmentCount; i++) {
          newInstallmentsData.push({
            loanId: id,
            number: i,
            dueDate: addFrequency(firstDue, frequency, i - 1),
            amount: installmentAmount,
          });
        }

        if (newInstallmentsData.length > 0) {
          await tx.installment.createMany({
            data: newInstallmentsData,
          });
        }

        const paidTotal = paidInstallments.reduce(
          (sum, inst) => sum.add(inst.paidAmount),
          money(0),
        );
        const remainingTotal = installmentAmount.mul(
          installmentCount - paidInstallments.length,
        );
        const totalContracted = paidTotal.add(remainingTotal);

        const capitalRatio = totalContracted.greaterThan(0)
          ? principalAmount.div(totalContracted)
          : money(1);
        const recoveredCapital = paidTotal.mul(capitalRatio);
        const calculatedPrincipalBalance = Prisma.Decimal.max(
          money(0),
          principalAmount.sub(recoveredCapital),
        );
        const finalPrincipalBalance =
          dto.principalBalance !== undefined
            ? money(dto.principalBalance)
            : calculatedPrincipalBalance;

        await tx.loan.update({
          where: { id },
          data: {
            principalAmount,
            principalBalance: finalPrincipalBalance,
            firstDueDate: firstDue,
            frequency,
            installmentCount,
            installmentAmount,
            totalContracted,
            lateFeePerDay: dto.lateFeePerDay ?? loan.lateFeePerDay,
          },
        });
      });
    } else if (loan.type === LoanType.MONTHLY_INTEREST) {
      if (dto.monthlyInterestRate && dto.monthlyInterestAmount) {
        throw new BadRequestException(
          'Informe a taxa ou o valor mensal, não ambos.',
        );
      }

      const monthlyDueDay = dto.monthlyDueDay ?? loan.monthlyDueDay!;
      const interestAmount = dto.monthlyInterestAmount
        ? money(dto.monthlyInterestAmount)
        : dto.monthlyInterestRate
          ? principalBalance.mul(dto.monthlyInterestRate).div(100)
          : loan.monthlyInterestAmount!;
      const dueDate = monthlyDueDate(loan.loanDate, monthlyDueDay);

      await this.prisma.$transaction(async (tx) => {
        await tx.monthlyCharge.updateMany({
          where: { loanId: id, status: { in: ['PENDING', 'OVERDUE'] } },
          data: {
            dueDate,
            referenceMonth: referenceMonth(dueDate),
            interestAmount,
          },
        });

        await tx.loan.update({
          where: { id },
          data: {
            principalAmount,
            principalBalance,
            firstDueDate: dueDate,
            monthlyDueDay,
            monthlyInterestRate: dto.monthlyInterestAmount
              ? null
              : (dto.monthlyInterestRate ?? loan.monthlyInterestRate),
            monthlyInterestAmount: interestAmount,
            lateFeePerDay: dto.lateFeePerDay ?? loan.lateFeePerDay,
          },
        });
      });
    }

    return this.findOne(ownerId, id);
  }

  async cancel(ownerId: string, id: string) {
    const loan = await this.ensureOwner(ownerId, id);
    if (loan.status === 'PAID' || loan.status === 'RENEWED') {
      throw new BadRequestException('Este contrato não pode ser cancelado.');
    }
    await this.prisma.loan.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    await this.receipts.purgeLoan(ownerId, id, true);
    return { success: true };
  }

  async remove(ownerId: string, id: string) {
    await this.ensureOwner(ownerId, id);
    await this.receipts.purgeLoan(ownerId, id);

    await this.prisma.$transaction(async (tx) => {
      const paymentIds = (
        await tx.payment.findMany({
          where: { loanId: id },
          select: { id: true },
        })
      ).map((payment) => payment.id);

      await tx.cashTransaction.deleteMany({
        where: {
          OR: [
            { loanId: id },
            ...(paymentIds.length ? [{ paymentId: { in: paymentIds } }] : []),
          ],
        },
      });
      await tx.payment.deleteMany({ where: { loanId: id } });
      await tx.installment.deleteMany({ where: { loanId: id } });
      await tx.monthlyCharge.deleteMany({ where: { loanId: id } });
      await tx.loan.updateMany({
        where: { previousLoanId: id },
        data: { previousLoanId: null },
      });
      await tx.loan.delete({ where: { id } });
    });

    return { success: true };
  }

  private validate(dto: CreateLoanDto) {
    if (
      dto.type === LoanType.WEEKLY &&
      (!dto.installmentCount || !dto.installmentAmount || !dto.firstDueDate)
    ) {
      throw new BadRequestException(
        'Informe quantidade, valor e primeiro vencimento das parcelas.',
      );
    }
    if (
      dto.type === LoanType.MONTHLY_INTEREST &&
      (!dto.monthlyDueDay ||
        (!dto.monthlyInterestAmount && !dto.monthlyInterestRate))
    ) {
      throw new BadRequestException(
        'Informe vencimento e taxa ou valor de juros mensal.',
      );
    }
    if (dto.monthlyInterestAmount && dto.monthlyInterestRate) {
      throw new BadRequestException(
        'Informe a taxa ou o valor mensal, não ambos.',
      );
    }
    const principal = money(dto.principalAmount);
    if (
      dto.type === LoanType.WEEKLY &&
      money(dto.installmentAmount!)
        .mul(dto.installmentCount!)
        .lessThan(principal)
    ) {
      throw new BadRequestException(
        'O total das parcelas não pode ser menor que o valor principal.',
      );
    }
    if (
      dto.firstDueDate &&
      asUtcDate(dto.firstDueDate) < asUtcDate(dto.loanDate)
    ) {
      throw new BadRequestException(
        'O primeiro vencimento não pode ser anterior ao empréstimo.',
      );
    }
  }

  private async ensureOwner(ownerId: string, id: string) {
    const loan = await this.prisma.loan.findFirst({
      where: { id, customer: { ownerId } },
    });
    if (!loan) throw new NotFoundException('Empréstimo não encontrado.');
    return loan;
  }

  private withSummary(loan: LoanWithDetails) {
    const chargeItems =
      loan.type === 'WEEKLY' ? loan.installments : loan.monthlyCharges;
    const received = loan.payments.reduce(
      (sum, payment) => sum + numberOf(payment.amount),
      0,
    );
    const openCharges = chargeItems.reduce(
      (sum, charge) =>
        sum +
        numberOf('amount' in charge ? charge.amount : charge.interestAmount) -
        numberOf(charge.paidAmount),
      0,
    );
    const next = chargeItems.find((item) => item.status !== 'PAID');
    const overdue = chargeItems.filter((item) => item.status === 'OVERDUE');
    const lateFees = overdue.reduce(
      (sum, item) =>
        sum + overdueDays(item.dueDate) * numberOf(loan.lateFeePerDay),
      0,
    );
    return {
      ...loan,
      receipts: ['ACTIVE', 'OVERDUE'].includes(loan.status)
        ? loan.receipts
        : [],
      summary: {
        received,
        openBalance:
          loan.type === 'WEEKLY'
            ? openCharges
            : numberOf(loan.principalBalance) + openCharges,
        paidCount: chargeItems.filter((item) => item.status === 'PAID').length,
        totalCount: chargeItems.length,
        nextDue: next?.dueDate || null,
        overdueCount: overdue.length,
        lateFees,
      },
    };
  }
}
