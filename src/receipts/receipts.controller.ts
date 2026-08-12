import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { MAX_RECEIPT_UPLOAD_BYTES, ReceiptsService } from './receipts.service';

@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get('storage/status')
  @Throttle({ default: { limit: 10, ttl: 60_000, blockDuration: 60_000 } })
  status(@CurrentUser() user: AuthUser) {
    return this.receipts.status(user.id);
  }

  @Get('loans/:loanId')
  list(@CurrentUser() user: AuthUser, @Param('loanId') loanId: string) {
    return this.receipts.list(user.id, loanId);
  }

  @Post('loans/:loanId')
  @Throttle({ default: { limit: 10, ttl: 60_000, blockDuration: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_RECEIPT_UPLOAD_BYTES, files: 1 },
    }),
  )
  create(
    @CurrentUser() user: AuthUser,
    @Param('loanId') loanId: string,
    @Body() dto: CreateReceiptDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.receipts.create(user.id, loanId, dto, file);
  }

  @Get(':id/file-url')
  @Throttle({ default: { limit: 60, ttl: 60_000, blockDuration: 60_000 } })
  fileUrl(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.receipts.fileUrl(user.id, id);
  }

  @Get(':id/file')
  @Throttle({ default: { limit: 60, ttl: 60_000, blockDuration: 60_000 } })
  async file(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() response: Response,
  ) {
    const receipt = await this.receipts.file(user.id, id);
    response.setHeader('Content-Type', receipt.mimeType);
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader(
      'Content-Disposition',
      `inline; filename*=UTF-8''${encodeURIComponent(receipt.originalName)}`,
    );
    response.send(receipt.buffer);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.receipts.remove(user.id, id);
  }
}
