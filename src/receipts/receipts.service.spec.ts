import { ReceiptKind } from '@prisma/client';
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
  const service = new ReceiptsService(prisma, storage);

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
});
