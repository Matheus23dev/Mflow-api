import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { CashService } from './cash.service';
import { CreateCashTransactionDto } from './dto/create-cash-transaction.dto';

@Controller('cash')
export class CashController {
  constructor(private readonly cash: CashService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.cash.list(user.id, from, to);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCashTransactionDto) {
    return this.cash.create(user.id, dto);
  }
}
