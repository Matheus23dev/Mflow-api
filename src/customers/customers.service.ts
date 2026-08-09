import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PortfolioStatusService } from '../common/portfolio-status.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portfolioStatus: PortfolioStatusService,
  ) {}

  async list(ownerId: string, search?: string) {
    await this.portfolioStatus.refresh(ownerId);
    const customers = await this.prisma.customer.findMany({
      where: {
        ownerId,
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { phone: { contains: search } },
                { cpf: { contains: search } },
              ],
            }
          : {}),
      },
      include: {
        _count: { select: { loans: true } },
        loans: {
          where: { status: { in: ['ACTIVE', 'OVERDUE'] } },
          include: { installments: true, monthlyCharges: true },
        },
      },
      orderBy: { name: 'asc' },
    });
    return customers.map((customer) => ({
      ...customer,
      loans: customer.loans.map((loan) => ({
        id: loan.id,
        status: loan.status,
        principalBalance: loan.principalBalance,
        totalContracted: loan.totalContracted,
        openBalance:
          loan.type === 'WEEKLY'
            ? loan.installments.reduce(
                (sum, item) =>
                  sum + Number(item.amount) - Number(item.paidAmount),
                0,
              )
            : Number(loan.principalBalance) +
              loan.monthlyCharges.reduce(
                (sum, item) =>
                  sum + Number(item.interestAmount) - Number(item.paidAmount),
                0,
              ),
      })),
    }));
  }

  async findOne(ownerId: string, id: string) {
    await this.portfolioStatus.refresh(ownerId);
    const customer = await this.prisma.customer.findFirst({
      where: { id, ownerId },
      include: {
        loans: {
          include: {
            installments: { orderBy: { number: 'asc' } },
            monthlyCharges: { orderBy: { dueDate: 'asc' } },
            payments: { orderBy: { paymentDate: 'desc' } },
          },
          orderBy: { loanDate: 'desc' },
        },
        payments: { orderBy: { paymentDate: 'desc' }, take: 100 },
      },
    });
    if (!customer) throw new NotFoundException('Cliente não encontrado.');

    const totalLent = customer.loans.reduce(
      (sum, loan) => sum.add(loan.releasedAmount),
      new Prisma.Decimal(0),
    );
    const totalReceived = customer.payments.reduce(
      (sum, payment) => sum.add(payment.amount),
      new Prisma.Decimal(0),
    );
    const totalOpen = customer.loans
      .filter((loan) => ['ACTIVE', 'OVERDUE'].includes(loan.status))
      .reduce((sum, loan) => {
        if (loan.type === 'MONTHLY_INTEREST') {
          return sum
            .add(loan.principalBalance)
            .add(
              loan.monthlyCharges.reduce(
                (subtotal, charge) =>
                  subtotal.add(charge.interestAmount).sub(charge.paidAmount),
                new Prisma.Decimal(0),
              ),
            );
        }
        return sum.add(
          loan.installments.reduce(
            (subtotal, installment) =>
              subtotal.add(installment.amount).sub(installment.paidAmount),
            new Prisma.Decimal(0),
          ),
        );
      }, new Prisma.Decimal(0));
    const overdueCount = customer.loans.reduce(
      (count, loan) =>
        count +
        loan.installments.filter((item) => item.status === 'OVERDUE').length +
        loan.monthlyCharges.filter((item) => item.status === 'OVERDUE').length,
      0,
    );

    return {
      ...customer,
      stats: {
        totalLent,
        totalReceived,
        totalOpen,
        loanCount: customer.loans.length,
        overdueCount,
      },
    };
  }

  create(ownerId: string, dto: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: {
        ownerId,
        name: dto.name.trim(),
        phone: dto.phone.trim(),
        cpf: dto.cpf?.trim() || null,
        address: dto.address?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
    });
  }

  async update(ownerId: string, id: string, dto: UpdateCustomerDto) {
    await this.ensureOwner(ownerId, id);
    return this.prisma.customer.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        phone: dto.phone?.trim(),
        cpf: dto.cpf === undefined ? undefined : dto.cpf.trim() || null,
        address:
          dto.address === undefined ? undefined : dto.address.trim() || null,
        notes: dto.notes === undefined ? undefined : dto.notes.trim() || null,
      },
    });
  }

  async remove(ownerId: string, id: string) {
    await this.ensureOwner(ownerId, id);
    if (await this.prisma.loan.count({ where: { customerId: id } })) {
      throw new ConflictException(
        'Clientes com histórico financeiro não podem ser excluídos.',
      );
    }
    await this.prisma.customer.delete({ where: { id } });
    return { success: true };
  }

  private async ensureOwner(ownerId: string, id: string) {
    if (!(await this.prisma.customer.count({ where: { id, ownerId } }))) {
      throw new NotFoundException('Cliente não encontrado.');
    }
  }
}
