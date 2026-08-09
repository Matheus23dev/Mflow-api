import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator';

@Controller()
export class AppController {
  @Public()
  @Get()
  health() {
    return {
      name: 'MFlow API',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
