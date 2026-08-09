import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaService();

async function main() {
  const passwordHash = await bcrypt.hash('123456', 12);
  await prisma.$transaction(async (tx) => {
    await tx.cashTransaction.deleteMany();
    await tx.payment.deleteMany();
    await tx.installment.deleteMany();
    await tx.monthlyCharge.deleteMany();
    await tx.loan.deleteMany();
    await tx.customer.deleteMany();
    await tx.user.deleteMany();
    await tx.user.create({
      data: {
        name: 'Administrador',
        email: 'admin@gmail.com',
        passwordHash,
        role: 'ADMIN',
      },
    });
  });

  const [users, customers, loans, payments, cashTransactions] =
    await Promise.all([
      prisma.user.count(),
      prisma.customer.count(),
      prisma.loan.count(),
      prisma.payment.count(),
      prisma.cashTransaction.count(),
    ]);
  if (
    users !== 1 ||
    customers !== 0 ||
    loans !== 0 ||
    payments !== 0 ||
    cashTransactions !== 0
  ) {
    throw new Error(
      'A verificação final do banco não corresponde ao esperado.',
    );
  }
}

main()
  .then(() => console.log('Banco limpo e administrador criado com sucesso.'))
  .catch((error: unknown) => {
    console.error('Não foi possível limpar o banco.', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
