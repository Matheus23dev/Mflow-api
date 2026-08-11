import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function databaseConfig() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error('DATABASE_URL não foi configurada.');
  const url = new URL(value);
  const isAiven = url.hostname.endsWith('.aivencloud.com');
  const isTiDb = url.hostname.endsWith('.tidbcloud.com');
  const localCaPath = join(process.cwd(), 'prisma', 'aiven-ca.pem');
  const databaseCa =
    process.env.DATABASE_CA?.replace(/\\n/g, '\n').trim() ||
    (isAiven && existsSync(localCaPath)
      ? readFileSync(localCaPath, 'utf8').trim()
      : undefined);
  if (isAiven && !databaseCa) {
    throw new Error(
      'DATABASE_CA não foi configurada com o certificado CA do Aiven.',
    );
  }
  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    // O Aiven pode levar mais de 1 segundo para concluir a primeira conexão
    // TLS. O padrão do driver é curto demais e fazia os logins falharem.
    connectionLimit: 5,
    connectTimeout: 15_000,
    ...(isAiven || isTiDb
      ? {
          ssl: {
            rejectUnauthorized: true,
            ...(databaseCa ? { ca: databaseCa } : {}),
          },
        }
      : {}),
  };
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({ adapter: new PrismaMariaDb(databaseConfig()) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
