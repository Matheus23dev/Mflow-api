import { Prisma } from '@prisma/client';

export const money = (value: Prisma.Decimal.Value) =>
  new Prisma.Decimal(value).toDecimalPlaces(2);
export const numberOf = (value: Prisma.Decimal.Value | null | undefined) =>
  value == null ? 0 : Number(value);
