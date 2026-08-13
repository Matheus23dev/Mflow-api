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
        totalContracted: '3200',
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
        monthlyCharges: [
          {
            interestAmount: '300',
            paidAmount: '50',
            dueDate: new Date(),
          },
        ],
        payments: [
          {
            type: 'INTEREST',
            amount: '210',
            lateFeeAmount: '10',
            paymentDate: new Date(),
          },
          {
            type: 'PRINCIPAL',
            amount: '500',
            lateFeeAmount: '0',
            paymentDate: new Date(),
          },
        ],
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
    expect(result.portfolios.weekly).toEqual({
      activeContracts: 1,
      capitalLent: 2000,
      totalContracted: 3200,
      received: 400,
      remainingReceivable: 400,
      contractedProfit: 1200,
      overdueAmount: 0,
      overdueInstallments: 0,
      collectionRate: 12.5,
    });
    expect(result.portfolios.monthlyInterest).toEqual({
      activeContracts: 1,
      capitalLent: 3000,
      capitalInCirculation: 2500,
      interestDueThisMonth: 300,
      interestReceivedThisMonth: 200,
      interestRemainingThisMonth: 250,
      previousInterestOverdue: 0,
      principalReturnedThisMonth: 500,
      monthlyYieldRate: 8,
    });
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
