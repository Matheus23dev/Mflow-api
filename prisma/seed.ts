import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../src/prisma/prisma.service';

const prisma = new PrismaService();

async function main() {
  const passwordHash = await bcrypt.hash('123456', 12);
  await prisma.user.upsert({
    where: { email: 'admin@gmail.com' },
    update: { name: 'Administrador', passwordHash, role: 'ADMIN' },
    create: {
      name: 'Administrador',
      email: 'admin@gmail.com',
      passwordHash,
      role: 'ADMIN',
    },
  });
}

main()
  .then(() => console.log('Usuário administrador configurado com sucesso.'))
  .catch((error: unknown) => {
    console.error('Não foi possível configurar o administrador.', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
