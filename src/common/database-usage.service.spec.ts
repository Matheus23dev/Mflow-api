import { PrismaService } from '../prisma/prisma.service';
import { DatabaseUsageService } from './database-usage.service';

describe('DatabaseUsageService', () => {
  const queryRaw = jest.fn();
  const prisma = {
    $queryRaw: queryRaw,
    receiptStorageState: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retorna o consumo e a margem restante do plano gratuito', async () => {
    queryRaw.mockResolvedValue([{ usedBytes: 120_000_000n }]);
    const service = new DatabaseUsageService(prisma);

    await expect(service.status(false)).resolves.toMatchObject({
      usedBytes: 120_000_000,
      remainingBytes: 380_000_000,
      freeLimitBytes: 500_000_000,
      percent: 24,
      level: 'NORMAL',
    });
  });

  it('sinaliza quando o banco ultrapassa o primeiro alerta', async () => {
    queryRaw.mockResolvedValue([{ usedBytes: 360_000_000n }]);
    const service = new DatabaseUsageService(prisma);

    await expect(service.status(false)).resolves.toMatchObject({
      usedBytes: 360_000_000,
      level: 'WARNING',
    });
  });
});
