import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { LoanStatus, LoanType } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { CreateLoanDto } from './dto/create-loan.dto';
import { UpdateLoanDto } from './dto/update-loan.dto';
import { LoansService } from './loans.service';

@Controller('loans')
export class LoansController {
  constructor(private readonly loans: LoansService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('status') status?: LoanStatus,
    @Query('type') type?: LoanType,
  ) {
    return this.loans.list(user.id, status, type);
  }

  @Get(':id')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.loans.findOne(user.id, id);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateLoanDto) {
    return this.loans.create(user.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateLoanDto,
  ) {
    return this.loans.update(user.id, id, dto);
  }

  @Post(':id/cancel')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.loans.cancel(user.id, id);
  }
}
