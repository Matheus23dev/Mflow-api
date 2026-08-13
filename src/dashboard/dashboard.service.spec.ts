import { CollectionsService } from '../collections/collections.service';
import { PortfolioStatusService } from '../common/portfolio-status.service';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  it('separa o capital original do saldo a receber nas duas modalidades', async () => {
    const loans = [
      {
        status: 'ACTIVE',
        type: 'WEEKLY',
        principalAmount: '2000',
        principalBalance: '1000',
        installments: [
          { amount: '400', paidAmount: '400' },
          { amount: '400', paidAmount: '0' },
        ],
        monthlyCharges: [],
        payments: [],
      },
      {
        status: 'OVERDUE',
        type: 'MONTHLY_INTEREST',
        principalAmount: '3000',
        principalBalance: '2500',
        installments: [],
        monthlyCharges: [{ interestAmount: '300', paidAmount: '50' }],
        payments: [],
      },
      {
        status: 'PAID',
        type: 'WEEKLY',
        principalAmount: '9000',
        principalBalance: '0',
        installments: [{ amount: '12000', paidAmount: '12000' }],
        monthlyCharges: [],
        payments: [],
      },
    ];
    const prisma = {
      loan: {
        findMany: jest.fn().mockResolvedValue(loans),
        count: jest.fn().mockResolvedValue(0),
      },
      customer: { count: jest.fn().mockResolvedValue(2) },
      cashTransaction: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: null } }),
      },
    } as unknown as PrismaService;
    const collections = {
      list: jest.fn().mockResolvedValue([]),
    } as unknown as CollectionsService;
    const portfolioStatus = {
      refresh: jest.fn().mockResolvedValue(undefined),
    } as unknown as PortfolioStatusService;
    const service = new DashboardService(prisma, collections, portfolioStatus);

    const result = await service.get('owner-1');

    expect(result.metrics.capitalLent).toBe(5000);
    expect(result.metrics.openBalance).toBe(3150);
    expect(result.metrics.totalExpected).toBe(3150);
  });

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
