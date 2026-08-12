import { Prisma } from '@prisma/client';

export function renewalBalance(
  installments: Array<{
    amount: Prisma.Decimal;
    paidAmount: Prisma.Decimal;
  }>,
) {
  return installments.reduce(
    (sum, installment) =>
      sum.add(installment.amount.sub(installment.paidAmount)),
    new Prisma.Decimal(0),
  );
}
