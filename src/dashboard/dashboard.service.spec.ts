import { CollectionsService } from '../collections/collections.service';
import { PortfolioStatusService } from '../common/portfolio-status.service';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  it('calcula o atraso pela lista vencida, mesmo sem cobranças futuras', async () => {
    const prisma = {
      loan: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      customer: { count: jest.fn().mockResolvedValue(0) },
      cashTransaction: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      },
    } as unknown as PrismaService;
    const collections = {
      list: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ updatedAmount: 150 }]),
    } as unknown as CollectionsService;
    const portfolioStatus = {
      refresh: jest.fn().mockResolvedValue(undefined),
    } as unknown as PortfolioStatusService;
    const service = new DashboardService(prisma, collections, portfolioStatus);

    const result = await service.get('owner-1');

    expect(result.metrics.overdueAmount).toBe(150);
    expect(result.upcoming).toEqual([]);
  });
});
