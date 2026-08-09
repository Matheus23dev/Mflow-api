import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CashService } from './cash.service';

describe('CashService', () => {
  const findMany = jest.fn();
  let createdCall: unknown;
  const create = jest.fn((input: unknown) => {
    createdCall = input;
    return Promise.resolve({ id: 'cash-1' });
  });
  const service = new CashService({
    cashTransaction: { findMany, create },
  } as unknown as PrismaService);

  beforeEach(() => {
    jest.clearAllMocks();
    createdCall = undefined;
  });

  it('soma entradas e saídas automáticas e manuais', async () => {
    findMany.mockResolvedValue([
      { type: 'INCOME', amount: new Prisma.Decimal(500) },
      { type: 'EXPENSE', amount: new Prisma.Decimal(125.5) },
    ]);

    const result = await service.list('owner-1');

    expect(result.summary).toEqual({
      income: 500,
      expense: 125.5,
      balance: 374.5,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { ownerId: 'owner-1' },
            { loan: { customer: { ownerId: 'owner-1' } } },
          ],
        },
      }),
    );
  });

  it('registra uma retirada manual com descrição limpa', async () => {
    await service.create('owner-1', {
      type: 'EXPENSE',
      amount: 80,
      description: '  Compra de material  ',
      transactionDate: '2026-01-10',
    });

    expect(createdCall).toMatchObject({
      data: {
        ownerId: 'owner-1',
        type: 'EXPENSE',
        description: 'Compra de material',
      },
    });
  });
});
