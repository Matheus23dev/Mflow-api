import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';

@Controller('installments')
export class InstallmentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('loan/:loanId')
  async byLoan(@CurrentUser() user: AuthUser, @Param('loanId') loanId: string) {
    if (
      !(await this.prisma.loan.count({
        where: { id: loanId, customer: { ownerId: user.id } },
      }))
    ) {
      throw new NotFoundException('Empréstimo não encontrado.');
    }
    return this.prisma.installment.findMany({
      where: { loanId },
      orderBy: { number: 'asc' },
    });
  }
}
