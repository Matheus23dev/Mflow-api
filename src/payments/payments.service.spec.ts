import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PortfolioStatusService } from '../common/portfolio-status.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';

type PaymentParts = {
  closesCharge: boolean;
  baseApplied: Prisma.Decimal;
  lateFeeApplied: Prisma.Decimal;
};

describe('PaymentsService', () => {
  const service = new PaymentsService(
    {} as PrismaService,
    {} as PortfolioStatusService,
  );
  const parts = (payment: number, outstanding: number, fee: number) =>
    (
      service as unknown as {
        paymentParts: (
          payment: Prisma.Decimal,
          outstanding: Prisma.Decimal,
          fee: Prisma.Decimal,
        ) => PaymentParts;
      }
    ).paymentParts(
      new Prisma.Decimal(payment),
      new Prisma.Decimal(outstanding),
      new Prisma.Decimal(fee),
    );

  it('mantém a cobrança aberta quando apenas o valor-base é pago', () => {
    const result = parts(300, 300, 40);

    expect(result.closesCharge).toBe(false);
    expect(result.baseApplied.toFixed(2)).toBe('300.00');
    expect(result.lateFeeApplied.toFixed(2)).toBe('0.00');
  });

  it('separa a multa quando o valor atualizado é quitado', () => {
    const result = parts(340, 300, 40);

    expect(result.closesCharge).toBe(true);
    expect(result.baseApplied.toFixed(2)).toBe('300.00');
    expect(result.lateFeeApplied.toFixed(2)).toBe('40.00');
  });

  it('rejeita pagamento que cobre apenas parte da multa', () => {
    expect(() => parts(320, 300, 40)).toThrow(BadRequestException);
  });

  it('aceita a quitação exata de cobrança sem multa', () => {
    expect(parts(300, 300, 0).closesCharge).toBe(true);
  });
});
