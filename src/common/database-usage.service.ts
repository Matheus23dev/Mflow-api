import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type DatabaseUsageLevel = 'NORMAL' | 'WARNING' | 'CRITICAL' | 'DANGER';

const FREE_LIMIT_BYTES = 500_000_000;
const DEFAULT_WARNING_BYTES = 350_000_000;
const DEFAULT_CRITICAL_BYTES = 425_000_000;
const DEFAULT_DANGER_BYTES = 475_000_000;
const DATABASE_STATE_ID = 'database';

@Injectable()
export class DatabaseUsageService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseUsageService.name);
  private readonly warningBytes = Math.min(
    this.positiveEnv('DATABASE_WARNING_BYTES', DEFAULT_WARNING_BYTES),
    FREE_LIMIT_BYTES,
  );
  private readonly criticalBytes = Math.min(
    Math.max(
      this.positiveEnv('DATABASE_CRITICAL_BYTES', DEFAULT_CRITICAL_BYTES),
      this.warningBytes,
    ),
    FREE_LIMIT_BYTES,
  );
  private readonly dangerBytes = Math.min(
    Math.max(
      this.positiveEnv('DATABASE_DANGER_BYTES', DEFAULT_DANGER_BYTES),
      this.criticalBytes,
    ),
    FREE_LIMIT_BYTES,
  );

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.status(true);
    } catch (error) {
      this.logger.warn(
        `O uso do banco não pôde ser conferido: ${this.errorMessage(error)}`,
      );
    }
  }

  async status(notify = true) {
    const rows = await this.prisma.$queryRaw<Array<{ usedBytes: bigint }>>`
      SELECT pg_database_size(current_database())::bigint AS "usedBytes"
    `;
    const usedBytes = Number(rows[0]?.usedBytes || 0);
    const level: DatabaseUsageLevel =
      usedBytes >= this.dangerBytes
        ? 'DANGER'
        : usedBytes >= this.criticalBytes
          ? 'CRITICAL'
          : usedBytes >= this.warningBytes
            ? 'WARNING'
            : 'NORMAL';
    const status = {
      usedBytes,
      warningBytes: this.warningBytes,
      criticalBytes: this.criticalBytes,
      dangerBytes: this.dangerBytes,
      freeLimitBytes: FREE_LIMIT_BYTES,
      remainingBytes: Math.max(0, FREE_LIMIT_BYTES - usedBytes),
      percent: Number(((usedBytes / FREE_LIMIT_BYTES) * 100).toFixed(2)),
      level,
    };

    if (notify) await this.notifyIfNeeded(status);
    return status;
  }

  private async notifyIfNeeded(status: {
    level: DatabaseUsageLevel;
    usedBytes: number;
  }) {
    const state = await this.prisma.receiptStorageState.findUnique({
      where: { id: DATABASE_STATE_ID },
    });
    const rank: Record<DatabaseUsageLevel, number> = {
      NORMAL: 0,
      WARNING: 1,
      CRITICAL: 2,
      DANGER: 3,
    };
    const previous = (state?.lastAlertLevel || 'NORMAL') as DatabaseUsageLevel;

    if (rank[status.level] < rank[previous]) {
      await this.saveState(status.level, false);
      return;
    }
    if (status.level === 'NORMAL' || rank[status.level] <= rank[previous]) {
      return;
    }

    const webhook =
      process.env.DISCORD_ALERTS_WEBHOOK_URL?.trim() ||
      process.env.DISCORD_RECEIPTS_WEBHOOK_URL?.trim();
    if (!webhook) return;

    const labels: Record<Exclude<DatabaseUsageLevel, 'NORMAL'>, string> = {
      WARNING: 'Atenção',
      CRITICAL: 'Alerta crítico',
      DANGER: 'Limite quase atingido',
    };

    try {
      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: `**${labels[status.level]} — banco MFlow**\nUso: ${this.formatMegabytes(status.usedBytes)} de 500 MB do limite gratuito do Supabase.`,
          allowed_mentions: { parse: [] },
        }),
      });
      if (!response.ok) throw new Error(`Discord respondeu ${response.status}`);
      await this.saveState(status.level, true);
    } catch (error) {
      this.logger.warn(
        `Aviso do banco não enviado: ${this.errorMessage(error)}`,
      );
    }
  }

  private async saveState(level: DatabaseUsageLevel, alerted: boolean) {
    await this.prisma.receiptStorageState.upsert({
      where: { id: DATABASE_STATE_ID },
      create: {
        id: DATABASE_STATE_ID,
        lastAlertLevel: level,
        ...(alerted ? { lastAlertAt: new Date() } : {}),
      },
      update: {
        lastAlertLevel: level,
        ...(alerted ? { lastAlertAt: new Date() } : {}),
      },
    });
  }

  private positiveEnv(name: string, fallback: number) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private formatMegabytes(value: number) {
    return `${(value / 1_000_000).toFixed(1)} MB`;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'erro desconhecido';
  }
}
