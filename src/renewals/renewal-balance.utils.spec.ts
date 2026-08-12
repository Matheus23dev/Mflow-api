import { Prisma } from '@prisma/client';
import { renewalBalance } from './renewal-balance.utils';

describe('renewalBalance', () => {
  it('usa o valor das parcelas ainda não pagas na renovação', () => {
    const installments = Array.from({ length: 8 }, (_, index) => ({
      amount: new Prisma.Decimal(400),
      paidAmount: new Prisma.Decimal(index < 4 ? 400 : 0),
    }));

    expect(renewalBalance(installments).toFixed(2)).toBe('1600.00');
  });

  it('desconta pagamentos parciais do saldo restante', () => {
    const installments = [
      { amount: new Prisma.Decimal(400), paidAmount: new Prisma.Decimal(150) },
      { amount: new Prisma.Decimal(400), paidAmount: new Prisma.Decimal(0) },
    ];

    expect(renewalBalance(installments).toFixed(2)).toBe('650.00');
  });
});
