import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { CollectionsService } from './collections.service';

@Controller('collections')
export class CollectionsController {
  constructor(private readonly collections: CollectionsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Query('filter')
    filter?: 'today' | 'tomorrow' | 'week' | 'overdue' | '30days',
  ) {
    return this.collections.list(user.id, filter);
  }
}
