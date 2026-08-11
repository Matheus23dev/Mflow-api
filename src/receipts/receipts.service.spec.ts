import { ReceiptKind } from '@prisma/client';
import { DatabaseUsageService } from '../common/database-usage.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiptStorageService } from './receipt-storage.service';
import { ReceiptsService } from './receipts.service';

describe('ReceiptsService', () => {
  const findMany = jest.fn();
  const deleteMany = jest.fn();
  const removeMany = jest.fn();
  const prisma = {
    receipt: { findMany, deleteMany },
  } as unknown as PrismaService;
  const storage = {
    removeMany,
  } as unknown as ReceiptStorageService;
  const databaseUsage = {} as DatabaseUsageService;
  const service = new ReceiptsService(prisma, storage, databaseUsage);

  beforeEach(() => {
    jest.clearAllMocks();
    findMany.mockResolvedValue([
      { id: 'receipt-payment', objectKey: 'owner/loan/payment.pdf' },
    ]);
    removeMany.mockResolvedValue(undefined);
    deleteMany.mockResolvedValue({ count: 1 });
  });

  it('removes only payment receipts when a contract ends', async () => {
    await service.purgePaymentReceipts('owner-1', 'loan-1');

    expect(findMany).toHaveBeenCalledWith({
      where: {
        ownerId: 'owner-1',
        loanId: 'loan-1',
        kind: ReceiptKind.PAYMENT,
      },
      select: { id: true, objectKey: true },
    });
    expect(removeMany).toHaveBeenCalledWith(['owner/loan/payment.pdf']);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['receipt-payment'] } },
    });
  });

  it('removes every receipt only when the loan is permanently deleted', async () => {
    await service.purgeLoan('owner-1', 'loan-1');

    expect(findMany).toHaveBeenCalledWith({
      where: { ownerId: 'owner-1', loanId: 'loan-1' },
      select: { id: true, objectKey: true },
    });
  });

  it('organizes payment files by customer, contract and installment', () => {
    const objectKey = (
      service as unknown as {
        objectKey: (
          ownerId: string,
          loan: unknown,
          kind: ReceiptKind,
          payment: unknown,
          extension: string,
        ) => string;
      }
    ).objectKey(
      'owner-1',
      {
        id: 'loan-123',
        loanDate: new Date('2026-08-01T12:00:00.000Z'),
        customer: { id: 'customer-12345678', name: 'João da Silva' },
      },
      ReceiptKind.PAYMENT,
      {
        id: 'payment-1',
        type: 'INSTALLMENT',
        paymentDate: new Date('2026-08-11T12:00:00.000Z'),
        paymentMethod: 'PIX',
        installment: { number: 3 },
        monthlyCharge: null,
      },
      'pdf',
    );

    expect(objectKey).toMatch(
      /^usuarios\/owner-1\/clientes\/joao-da-silva--12345678\/contratos\/2026-08-01--loan-123\/pagamentos\/parcela-03--pix--2026-08-11--[a-f0-9-]+\.pdf$/,
    );
  });
});
