import { Module } from '@nestjs/common';
import { InstallmentsController } from './installments.controller';

@Module({ controllers: [InstallmentsController] })
export class InstallmentsModule {}
