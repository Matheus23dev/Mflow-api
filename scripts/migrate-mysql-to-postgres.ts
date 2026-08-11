import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import mariadb, { PoolConnection } from 'mariadb';

type TableName =
  | 'User'
  | 'Customer'
  | 'Loan'
  | 'Installment'
  | 'MonthlyCharge'
  | 'Payment'
  | 'CashTransaction'
  | 'Receipt'
  | 'ReceiptStorageState';

type MigrationData = {
  users: Prisma.UserCreateManyInput[];
  customers: Prisma.CustomerCreateManyInput[];
  loans: Prisma.LoanCreateManyInput[];
  installments: Prisma.InstallmentCreateManyInput[];
  monthlyCharges: Prisma.MonthlyChargeCreateManyInput[];
  payments: Prisma.PaymentCreateManyInput[];
  cashTransactions: Prisma.CashTransactionCreateManyInput[];
  receipts: Prisma.ReceiptCreateManyInput[];
  receiptStorageStates: Prisma.ReceiptStorageStateCreateManyInput[];
};

type CountMap = Record<keyof MigrationData, number>;

function requiredUrl(name: 'MYSQL_SOURCE_URL' | 'POSTGRES_TARGET_URL') {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} não foi configurada.`);
  return value;
}

function sourceConfig() {
  const value = requiredUrl('MYSQL_SOURCE_URL');
  const url = new URL(value);
  if (url.protocol !== 'mysql:') {
    throw new Error('MYSQL_SOURCE_URL deve começar com mysql://.');
  }

  const isAiven = url.hostname.endsWith('.aivencloud.com');
  const isTiDb = url.hostname.endsWith('.tidbcloud.com');
  const localCaPath = join(process.cwd(), 'prisma', 'aiven-ca.pem');
  const databaseCa =
    process.env.MYSQL_SOURCE_CA?.replace(/\\n/g, '\n').trim() ||
    process.env.DATABASE_CA?.replace(/\\n/g, '\n').trim() ||
    (isAiven && existsSync(localCaPath)
      ? readFileSync(localCaPath, 'utf8').trim()
      : undefined);

  if (isAiven && !databaseCa) {
    throw new Error(
      'MYSQL_SOURCE_CA deve conter o certificado CA atual do Aiven.',
    );
  }

  return {
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    connectionLimit: 1,
    connectTimeout: 15_000,
    timezone: 'Z',
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

function targetConfig() {
  const value = requiredUrl('POSTGRES_TARGET_URL');
  const url = new URL(value);
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error(
      'POSTGRES_TARGET_URL deve usar uma conexão PostgreSQL do Supabase.',
    );
  }

  const localCaPath = join(process.cwd(), 'prisma', 'supabase-ca.crt');
  const databaseCa =
    process.env.SUPABASE_DATABASE_CA?.replace(/\\n/g, '\n').trim() ||
    (existsSync(localCaPath)
      ? readFileSync(localCaPath, 'utf8').trim()
      : undefined);

  if (!databaseCa) {
    throw new Error(
      'Baixe o certificado SSL do Supabase em prisma/supabase-ca.crt.',
    );
  }

  url.searchParams.delete('sslmode');

  return {
    connectionString: url.toString(),
    max: 3,
    connectionTimeoutMillis: 15_000,
    ssl: { ca: databaseCa, rejectUnauthorized: true },
  };
}

async function readTable<T>(connection: PoolConnection, table: TableName) {
  const result: unknown = await connection.query(`SELECT * FROM \`${table}\``);
  if (!Array.isArray(result)) {
    throw new Error(`O Aiven retornou um formato inválido para ${table}.`);
  }
  return result as T[];
}

async function readSource(connection: PoolConnection): Promise<MigrationData> {
  return {
    users: await readTable<Prisma.UserCreateManyInput>(connection, 'User'),
    customers: await readTable<Prisma.CustomerCreateManyInput>(
      connection,
      'Customer',
    ),
    loans: await readTable<Prisma.LoanCreateManyInput>(connection, 'Loan'),
    installments: await readTable<Prisma.InstallmentCreateManyInput>(
      connection,
      'Installment',
    ),
    monthlyCharges: await readTable<Prisma.MonthlyChargeCreateManyInput>(
      connection,
      'MonthlyCharge',
    ),
    payments: await readTable<Prisma.PaymentCreateManyInput>(
      connection,
      'Payment',
    ),
    cashTransactions: await readTable<Prisma.CashTransactionCreateManyInput>(
      connection,
      'CashTransaction',
    ),
    receipts: await readTable<Prisma.ReceiptCreateManyInput>(
      connection,
      'Receipt',
    ),
    receiptStorageStates:
      await readTable<Prisma.ReceiptStorageStateCreateManyInput>(
        connection,
        'ReceiptStorageState',
      ),
  };
}

function sourceCounts(data: MigrationData): CountMap {
  return {
    users: data.users.length,
    customers: data.customers.length,
    loans: data.loans.length,
    installments: data.installments.length,
    monthlyCharges: data.monthlyCharges.length,
    payments: data.payments.length,
    cashTransactions: data.cashTransactions.length,
    receipts: data.receipts.length,
    receiptStorageStates: data.receiptStorageStates.length,
  };
}

async function targetCounts(prisma: PrismaClient): Promise<CountMap> {
  const [
    users,
    customers,
    loans,
    installments,
    monthlyCharges,
    payments,
    cashTransactions,
    receipts,
    receiptStorageStates,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.customer.count(),
    prisma.loan.count(),
    prisma.installment.count(),
    prisma.monthlyCharge.count(),
    prisma.payment.count(),
    prisma.cashTransaction.count(),
    prisma.receipt.count(),
    prisma.receiptStorageState.count(),
  ]);

  return {
    users,
    customers,
    loans,
    installments,
    monthlyCharges,
    payments,
    cashTransactions,
    receipts,
    receiptStorageStates,
  };
}

function total(counts: CountMap) {
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

function assertSameCounts(source: CountMap, target: CountMap) {
  const mismatches = Object.keys(source).filter(
    (key) => source[key as keyof CountMap] !== target[key as keyof CountMap],
  );

  if (mismatches.length) {
    throw new Error(
      `A conferência falhou nas tabelas: ${mismatches.join(', ')}.`,
    );
  }
}

async function insertData(prisma: PrismaClient, data: MigrationData) {
  const loanLinks = data.loans
    .filter((loan) => Boolean(loan.previousLoanId))
    .map((loan) => ({ id: loan.id, previousLoanId: loan.previousLoanId! }));
  const loansWithoutLinks = data.loans.map((loan) => ({
    ...loan,
    previousLoanId: null,
  }));

  await prisma.$transaction(
    async (tx) => {
      await tx.user.createMany({ data: data.users });
      await tx.customer.createMany({ data: data.customers });
      await tx.loan.createMany({ data: loansWithoutLinks });

      for (const link of loanLinks) {
        await tx.loan.update({
          where: { id: link.id },
          data: { previousLoanId: link.previousLoanId },
        });
      }

      await tx.installment.createMany({ data: data.installments });
      await tx.monthlyCharge.createMany({ data: data.monthlyCharges });
      await tx.payment.createMany({ data: data.payments });
      await tx.cashTransaction.createMany({ data: data.cashTransactions });
      await tx.receipt.createMany({ data: data.receipts });
      await tx.receiptStorageState.createMany({
        data: data.receiptStorageStates,
      });
    },
    { maxWait: 15_000, timeout: 120_000 },
  );
}

async function main() {
  const postgresConfig = targetConfig();
  const sourcePool = mariadb.createPool(sourceConfig());
  const source = await sourcePool.getConnection();
  const target = new PrismaClient({
    adapter: new PrismaPg(postgresConfig),
  });

  try {
    await source.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await source.beginTransaction();

    const data = await readSource(source);
    const before = await targetCounts(target);
    if (total(before) > 0) {
      throw new Error(
        'O PostgreSQL de destino não está vazio. A cópia foi cancelada para evitar duplicidade.',
      );
    }

    const expected = sourceCounts(data);
    console.log('Registros encontrados no Aiven:');
    console.table(expected);

    await insertData(target, data);
    const migrated = await targetCounts(target);
    assertSameCounts(expected, migrated);
    await source.commit();

    console.log('Migração concluída e conferida no Supabase:');
    console.table(migrated);
  } catch (error) {
    await source.rollback();
    throw error;
  } finally {
    await source.release();
    await sourcePool.end();
    await target.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error('Não foi possível migrar os dados.', error);
  process.exitCode = 1;
});
