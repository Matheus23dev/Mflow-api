import { PortfolioStatusService } from '../common/portfolio-status.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService } from './reports.service';

describe('ReportsService', () => {
  const refresh = jest.fn();
  const loanFindMany = jest.fn();
  const paymentFindMany = jest.fn();
  const prisma = {
    loan: { findMany: loanFindMany },
    payment: { findMany: paymentFindMany },
  } as unknown as PrismaService;
  const portfolioStatus = { refresh } as unknown as PortfolioStatusService;
  const service = new ReportsService(prisma, portfolioStatus);

  beforeEach(() => {
    jest.clearAllMocks();
    refresh.mockResolvedValue(undefined);
    loanFindMany
      .mockResolvedValueOnce([
        { releasedAmount: '1000' },
        { releasedAmount: '200' },
      ])
      .mockResolvedValueOnce([]);
    paymentFindMany.mockResolvedValue([
      {
        type: 'INSTALLMENT',
        amount: '400',
        lateFeeAmount: '25',
        loan: {
          type: 'WEEKLY',
          principalAmount: '1000',
          totalContracted: '1600',
        },
      },
      {
        type: 'RENEWAL_ENTRY',
        amount: '200',
        lateFeeAmount: '0',
        loan: {
          type: 'WEEKLY',
          principalAmount: '1000',
          totalContracted: '1600',
        },
      },
      {
        type: 'INTEREST',
        amount: '100',
        lateFeeAmount: '10',
        loan: {
          type: 'MONTHLY_INTEREST',
          principalAmount: '1000',
          totalContracted: '1000',
        },
      },
      {
        type: 'PRINCIPAL',
        amount: '300',
        lateFeeAmount: '0',
        loan: {
          type: 'MONTHLY_INTEREST',
          principalAmount: '1000',
          totalContracted: '1000',
        },
      },
    ]);
  });

  it('separates weekly interest and treats renewal entries as capital', async () => {
    const report = await service.get('owner-1');

    expect(report.metrics.totalLent).toBe(1200);
    expect(report.metrics.totalReceived).toBe(1000);
    expect(report.metrics.capitalRecovered).toBeCloseTo(734.375);
    expect(report.metrics.interestReceived).toBeCloseTo(230.625);
    expect(report.metrics.realizedProfit).toBeCloseTo(265.625);
  });

  it('calculates current open, overdue and projected balances', async () => {
    const dueDate = new Date();
    dueDate.setUTCHours(0, 0, 0, 0);
    dueDate.setUTCDate(dueDate.getUTCDate() - 3);
    loanFindMany.mockReset();
    paymentFindMany.mockReset();
    loanFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        type: 'WEEKLY',
        principalAmount: '1000',
        principalBalance: '600',
        totalContracted: '1500',
        lateFeePerDay: '10',
        installments: [
          {
            amount: '500',
            paidAmount: '100',
            status: 'OVERDUE',
            dueDate,
          },
          {
            amount: '500',
            paidAmount: '0',
            status: 'PENDING',
            dueDate: new Date(),
          },
        ],
        monthlyCharges: [],
      },
      {
        type: 'MONTHLY_INTEREST',
        principalAmount: '700',
        principalBalance: '700',
        totalContracted: '700',
        lateFeePerDay: '5',
        installments: [],
        monthlyCharges: [
          {
            interestAmount: '100',
            paidAmount: '20',
            status: 'PARTIAL',
            dueDate: new Date(),
          },
        ],
      },
    ]);
    paymentFindMany.mockResolvedValue([]);

    const report = await service.get('owner-1');

    expect(report.metrics.openBalance).toBe(1680);
    expect(report.metrics.overdue).toBe(430);
    expect(report.metrics.projectedProfit).toBeCloseTo(300);
  });
});
