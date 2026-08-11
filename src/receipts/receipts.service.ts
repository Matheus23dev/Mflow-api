import {
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Prisma, ReceiptKind } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { ReceiptStorageService } from './receipt-storage.service';

export const MAX_RECEIPT_UPLOAD_BYTES = 10_000_000;
const MAX_IMAGE_BYTES = 1_500_000;
const MAX_PDF_BYTES = 3_000_000;
const FREE_LIMIT_BYTES = 10_000_000_000;
const SAFE_HARD_LIMIT_BYTES = 9_000_000_000;
const DEFAULT_WARNING_BYTES = 8_000_000_000;
const DEFAULT_CRITICAL_BYTES = 8_500_000_000;
const STORAGE_STATE_ID = 'receipts';

type StorageLevel = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'BLOCKED';
const publicReceiptSelect = {
  id: true,
  loanId: true,
  paymentId: true,
  kind: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
} as const satisfies Prisma.ReceiptSelect;
type PublicReceipt = Prisma.ReceiptGetPayload<{
  select: typeof publicReceiptSelect;
}>;

@Injectable()
export class ReceiptsService implements OnModuleInit {
  private readonly logger = new Logger(ReceiptsService.name);
  private readonly hardLimitBytes = Math.min(
    this.positiveEnv('RECEIPTS_HARD_LIMIT_BYTES', SAFE_HARD_LIMIT_BYTES),
    SAFE_HARD_LIMIT_BYTES,
  );
  private readonly warningBytes = Math.min(
    this.positiveEnv('RECEIPTS_WARNING_BYTES', DEFAULT_WARNING_BYTES),
    this.hardLimitBytes,
  );
  private readonly criticalBytes = Math.min(
    Math.max(
      this.positiveEnv('RECEIPTS_CRITICAL_BYTES', DEFAULT_CRITICAL_BYTES),
      this.warningBytes,
    ),
    this.hardLimitBytes,
  );

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ReceiptStorageService,
  ) {}

  async onModuleInit() {
    if (!this.storage.isConfigured()) return;
    try {
      await this.purgeInactiveLoans(undefined, true);
    } catch (error) {
      this.logger.warn(
        `A limpeza inicial de comprovantes será tentada novamente: ${this.errorMessage(error)}`,
      );
    }
  }

  async list(ownerId: string, loanId: string) {
    await this.ensureLoanOwner(ownerId, loanId);
    await this.purgeInactiveLoans(ownerId, true);
    return this.prisma.receipt.findMany({
      where: { ownerId, loanId },
      select: publicReceiptSelect,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(
    ownerId: string,
    loanId: string,
    dto: CreateReceiptDto,
    file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Selecione um comprovante.');
    const loan = await this.ensureLoanOwner(ownerId, loanId);
    if (!['ACTIVE', 'OVERDUE'].includes(loan.status)) {
      throw new BadRequestException(
        'Comprovantes só podem ser salvos em empréstimos ativos.',
      );
    }
    await this.validatePayment(ownerId, loanId, dto);
    const optimized = await this.optimize(file);
    const before = await this.storageStatus(false);
    if (!before.configured) {
      throw new HttpException(
        'O armazenamento de comprovantes ainda não foi configurado.',
        503,
      );
    }
    if (before.usedBytes + optimized.buffer.length > this.hardLimitBytes) {
      await this.notifyIfNeeded({ ...before, level: 'BLOCKED' });
      throw new HttpException(
        'Armazenamento bloqueado no limite de segurança. Apague comprovantes ou aguarde contratos encerrarem.',
        507,
      );
    }

    const checksum = createHash('sha256')
      .update(optimized.buffer)
      .digest('hex');
    const objectKey = `${ownerId}/${loanId}/${randomUUID()}.${optimized.extension}`;
    await this.storage.put(
      objectKey,
      optimized.buffer,
      optimized.mimeType,
      checksum,
    );

    let receipt: PublicReceipt;
    try {
      receipt = await this.prisma.receipt.create({
        data: {
          ownerId,
          loanId,
          paymentId: dto.paymentId || null,
          kind: dto.kind,
          objectKey,
          originalName: this.safeOriginalName(file.originalname),
          mimeType: optimized.mimeType,
          sizeBytes: optimized.buffer.length,
          checksum,
        },
        select: publicReceiptSelect,
      });
    } catch (error) {
      await this.storage.removeMany([objectKey]).catch(() => undefined);
      throw error;
    }
    try {
      await this.notifyIfNeeded(await this.storageStatus(false));
    } catch (error) {
      this.logger.warn(
        `O comprovante foi salvo, mas o alerta de espaço falhou: ${this.errorMessage(error)}`,
      );
    }
    return receipt;
  }

  async file(ownerId: string, id: string) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { id, ownerId },
    });
    if (!receipt) throw new NotFoundException('Comprovante não encontrado.');
    return {
      buffer: await this.storage.get(receipt.objectKey),
      mimeType: receipt.mimeType,
      originalName: receipt.originalName,
    };
  }

  async remove(ownerId: string, id: string) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { id, ownerId },
    });
    if (!receipt) throw new NotFoundException('Comprovante não encontrado.');
    await this.storage.removeMany([receipt.objectKey]);
    await this.prisma.receipt.delete({ where: { id } });
    return { success: true };
  }

  async status(ownerId: string) {
    await this.purgeInactiveLoans(ownerId, true);
    const status = await this.storageStatus(false);
    await this.notifyIfNeeded(status);
    return status;
  }

  async purgeLoan(ownerId: string, loanId: string, bestEffort = false) {
    const receipts = await this.prisma.receipt.findMany({
      where: { ownerId, loanId },
      select: { id: true, objectKey: true },
    });
    if (!receipts.length) return;
    try {
      await this.storage.removeMany(receipts.map((item) => item.objectKey));
      await this.prisma.receipt.deleteMany({
        where: { id: { in: receipts.map((item) => item.id) } },
      });
    } catch (error) {
      if (!bestEffort) throw error;
      this.logger.warn(
        `A limpeza do empréstimo ${loanId} será tentada novamente: ${this.errorMessage(error)}`,
      );
    }
  }

  private async purgeInactiveLoans(ownerId?: string, bestEffort = false) {
    const receipts = await this.prisma.receipt.findMany({
      where: {
        ...(ownerId ? { ownerId } : {}),
        loan: { status: { notIn: ['ACTIVE', 'OVERDUE'] } },
      },
      select: { ownerId: true, loanId: true },
      distinct: ['loanId'],
    });
    for (const receipt of receipts) {
      await this.purgeLoan(receipt.ownerId, receipt.loanId, bestEffort);
    }
  }

  private async storageStatus(purge: boolean) {
    if (purge) await this.purgeInactiveLoans(undefined, true);
    const aggregate = await this.prisma.receipt.aggregate({
      _sum: { sizeBytes: true },
    });
    const usedBytes = Number(aggregate._sum.sizeBytes || 0);
    const level: StorageLevel =
      usedBytes >= this.hardLimitBytes
        ? 'BLOCKED'
        : usedBytes >= this.criticalBytes
          ? 'CRITICAL'
          : usedBytes >= this.warningBytes
            ? 'WARNING'
            : 'NORMAL';
    return {
      configured: this.storage.isConfigured(),
      usedBytes,
      warningBytes: this.warningBytes,
      criticalBytes: this.criticalBytes,
      hardLimitBytes: this.hardLimitBytes,
      freeLimitBytes: FREE_LIMIT_BYTES,
      remainingBytes: Math.max(0, this.hardLimitBytes - usedBytes),
      percent: Number(((usedBytes / this.hardLimitBytes) * 100).toFixed(2)),
      level,
      canUpload: this.storage.isConfigured() && usedBytes < this.hardLimitBytes,
    };
  }

  private async validatePayment(
    ownerId: string,
    loanId: string,
    dto: CreateReceiptDto,
  ) {
    if (dto.kind === ReceiptKind.PAYMENT && !dto.paymentId) {
      throw new BadRequestException(
        'Informe o pagamento relacionado ao comprovante.',
      );
    }
    if (dto.kind !== ReceiptKind.PAYMENT && dto.paymentId) {
      throw new BadRequestException(
        'Este tipo de comprovante não deve ter um pagamento relacionado.',
      );
    }
    if (!dto.paymentId) return;
    const payment = await this.prisma.payment.findFirst({
      where: { id: dto.paymentId, loanId, customer: { ownerId } },
      select: { id: true },
    });
    if (!payment) {
      throw new NotFoundException('Pagamento relacionado não encontrado.');
    }
  }

  private async ensureLoanOwner(ownerId: string, loanId: string) {
    const loan = await this.prisma.loan.findFirst({
      where: { id: loanId, customer: { ownerId } },
      select: { id: true, status: true },
    });
    if (!loan) throw new NotFoundException('Empréstimo não encontrado.');
    return loan;
  }

  private async optimize(file: Express.Multer.File) {
    if (file.mimetype === 'application/pdf') {
      if (!file.buffer.subarray(0, 5).toString('ascii').startsWith('%PDF-')) {
        throw new UnsupportedMediaTypeException('O PDF enviado é inválido.');
      }
      if (file.buffer.length > MAX_PDF_BYTES) {
        throw new BadRequestException(
          'O PDF deve ter no máximo 3 MB. Prefira uma imagem para maior economia.',
        );
      }
      return {
        buffer: file.buffer,
        mimeType: 'application/pdf',
        extension: 'pdf',
      };
    }

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      throw new UnsupportedMediaTypeException(
        'Envie uma imagem JPG, PNG, WebP ou um PDF.',
      );
    }

    let buffer = await sharp(file.buffer, { failOn: 'warning' })
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 68, effort: 5 })
      .toBuffer();

    if (buffer.length > MAX_IMAGE_BYTES) {
      buffer = await sharp(file.buffer, { failOn: 'warning' })
        .rotate()
        .resize({
          width: 1280,
          height: 1280,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: 52, effort: 6 })
        .toBuffer();
    }
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new BadRequestException(
        'A imagem continuou maior que 1,5 MB após a compactação.',
      );
    }
    return { buffer, mimeType: 'image/webp', extension: 'webp' };
  }

  private async notifyIfNeeded(status: {
    level: StorageLevel;
    usedBytes: number;
    hardLimitBytes: number;
  }) {
    const state = await this.prisma.receiptStorageState.findUnique({
      where: { id: STORAGE_STATE_ID },
    });
    const rank: Record<StorageLevel, number> = {
      NORMAL: 0,
      WARNING: 1,
      CRITICAL: 2,
      BLOCKED: 3,
    };
    const previous = (state?.lastAlertLevel || 'NORMAL') as StorageLevel;
    if (rank[status.level] < rank[previous]) {
      await this.prisma.receiptStorageState.upsert({
        where: { id: STORAGE_STATE_ID },
        create: { id: STORAGE_STATE_ID, lastAlertLevel: status.level },
        update: { lastAlertLevel: status.level },
      });
      return;
    }
    if (status.level === 'NORMAL' || rank[status.level] <= rank[previous]) {
      return;
    }

    const webhook = process.env.DISCORD_RECEIPTS_WEBHOOK_URL?.trim();
    if (!webhook) return;
    const labels: Record<Exclude<StorageLevel, 'NORMAL'>, string> = {
      WARNING: 'Atenção',
      CRITICAL: 'Alerta crítico',
      BLOCKED: 'Armazenamento bloqueado',
    };
    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `**${labels[status.level]} — comprovantes MFlow**\nUso: ${this.formatBytes(status.usedBytes)} de ${this.formatBytes(status.hardLimitBytes)} do limite de segurança.`,
          allowed_mentions: { parse: [] },
        }),
      });
      if (!response.ok) throw new Error(`Discord respondeu ${response.status}`);
      await this.prisma.receiptStorageState.upsert({
        where: { id: STORAGE_STATE_ID },
        create: {
          id: STORAGE_STATE_ID,
          lastAlertLevel: status.level,
          lastAlertAt: new Date(),
        },
        update: {
          lastAlertLevel: status.level,
          lastAlertAt: new Date(),
        },
      });
    } catch (error) {
      this.logger.warn(
        `Aviso do Discord não enviado: ${this.errorMessage(error)}`,
      );
    }
  }

  private positiveEnv(name: string, fallback: number) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private safeOriginalName(value: string) {
    return (
      path
        .basename(value)
        .replace(/[\r\n]/g, '')
        .slice(0, 180) || 'comprovante'
    );
  }

  private formatBytes(value: number) {
    return `${(value / 1_000_000_000).toFixed(2)} GB`;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'erro desconhecido';
  }
}
