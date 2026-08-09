import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { CreateRenewalDto } from './dto/create-renewal.dto';
import { RenewalsService } from './renewals.service';

@Controller('renewals')
export class RenewalsController {
  constructor(private readonly renewals: RenewalsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.renewals.list(user.id);
  }

  @Post(':loanId')
  create(
    @CurrentUser() user: AuthUser,
    @Param('loanId') loanId: string,
    @Body() dto: CreateRenewalDto,
  ) {
    return this.renewals.create(user.id, loanId, dto);
  }
}
