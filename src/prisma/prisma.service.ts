import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function databaseConfig() {
  const value = process.env.DATABASE_URL?.trim();
  if (!value) throw new Error('DATABASE_URL não foi configurada.');

  const url = new URL(value);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(
      'DATABASE_URL deve usar uma conexão PostgreSQL do Supabase.',
    );
  }

  const isSupabase = url.hostname.endsWith('.supabase.com');
  const localCaPath = join(process.cwd(), 'prisma', 'supabase-ca.crt');
  const databaseCa =
    process.env.SUPABASE_DATABASE_CA?.replace(/\\n/g, '\n').trim() ||
    (isSupabase && existsSync(localCaPath)
      ? readFileSync(localCaPath, 'utf8').trim()
      : undefined);

  if (isSupabase && !databaseCa) {
    throw new Error(
      'Baixe o certificado SSL do Supabase em prisma/supabase-ca.crt.',
    );
  }

  if (isSupabase) url.searchParams.delete('sslmode');

  return {
    connectionString: url.toString(),
    max: 5,
    connectionTimeoutMillis: 15_000,
    ...(databaseCa
      ? { ssl: { ca: databaseCa, rejectUnauthorized: true } }
      : {}),
  };
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      adapter: new PrismaPg(databaseConfig()),
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
