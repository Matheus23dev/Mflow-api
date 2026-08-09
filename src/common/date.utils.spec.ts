import {
  asUtcDate,
  monthlyDueDate,
  overdueDays,
  utcPeriod,
} from './date.utils';

describe('date utils', () => {
  it('preserva uma data ISO completa', () => {
    expect(asUtcDate('2026-08-09T15:30:00.000Z').toISOString()).toBe(
      '2026-08-09T15:30:00.000Z',
    );
  });

  it('não considera uma cobrança vencida durante o próprio dia', () => {
    const dueDate = new Date('2026-08-09T00:01:00.000Z');
    const laterThatDay = new Date('2026-08-09T23:59:00.000Z');

    expect(overdueDays(dueDate, laterThatDay)).toBe(0);
    expect(overdueDays(dueDate, new Date('2026-08-10T08:00:00.000Z'))).toBe(1);
  });

  it('ajusta vencimentos mensais para o último dia do mês', () => {
    const january = new Date('2026-01-31T12:00:00.000Z');

    expect(monthlyDueDate(january, 31, 1).toISOString()).toBe(
      '2026-02-28T12:00:00.000Z',
    );
  });

  it('inclui os dias inteiros nos filtros de período', () => {
    const period = utcPeriod('2026-08-01', '2026-08-09');

    expect(period.gte?.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(period.lte?.toISOString()).toBe('2026-08-09T23:59:59.999Z');
  });
});
