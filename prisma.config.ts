import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const migrationUrl =
  process.env.DIRECT_URL?.trim() ||
  process.env.POSTGRES_TARGET_URL?.trim() ||
  process.env.DATABASE_URL?.trim();

if (!migrationUrl) {
  throw new Error(
    'DIRECT_URL, POSTGRES_TARGET_URL ou DATABASE_URL deve ser configurada.',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'ts-node prisma/seed.ts',
  },
  datasource: { url: migrationUrl },
});
