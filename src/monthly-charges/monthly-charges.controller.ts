import { Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { MonthlyChargesService } from './monthly-charges.service';

@Controller('monthly-charges')
export class MonthlyChargesController {
  constructor(private readonly charges: MonthlyChargesService) {}

  @Get('loan/:loanId')
  byLoan(@CurrentUser() user: AuthUser, @Param('loanId') loanId: string) {
    return this.charges.byLoan(user.id, loanId);
  }

  @Post('loan/:loanId/generate-next')
  generateNext(@CurrentUser() user: AuthUser, @Param('loanId') loanId: string) {
    return this.charges.generateNext(user.id, loanId);
  }
}
