export const DAY_MS = 86_400_000;

export function asUtcDate(value: string | Date) {
  const date =
    value instanceof Date
      ? new Date(value)
      : /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(`${value}T12:00:00.000Z`)
        : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Data inválida.');
  return date;
}

export function startOfUtcDay(value = new Date()) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()),
  );
}

export function endOfUtcDay(value = new Date()) {
  const result = startOfUtcDay(value);
  result.setUTCHours(23, 59, 59, 999);
  return result;
}

export function utcPeriod(from?: string, to?: string) {
  return {
    ...(from ? { gte: startOfUtcDay(asUtcDate(from)) } : {}),
    ...(to ? { lte: endOfUtcDay(asUtcDate(to)) } : {}),
  };
}

export function addFrequency(
  date: Date,
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY',
  amount = 1,
) {
  const result = new Date(date);
  if (frequency === 'WEEKLY')
    result.setUTCDate(result.getUTCDate() + 7 * amount);
  if (frequency === 'BIWEEKLY')
    result.setUTCDate(result.getUTCDate() + 14 * amount);
  if (frequency === 'MONTHLY')
    result.setUTCMonth(result.getUTCMonth() + amount);
  return result;
}

export function monthlyDueDate(start: Date, dueDay: number, monthOffset = 0) {
  const result = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + monthOffset, 1, 12),
  );
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0, 12),
  ).getUTCDate();
  result.setUTCDate(Math.min(dueDay, lastDay));
  if (monthOffset === 0 && result < start)
    return monthlyDueDate(start, dueDay, 1);
  return result;
}

export function referenceMonth(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function overdueDays(dueDate: Date, now = new Date()) {
  return Math.max(
    0,
    Math.floor(
      (startOfUtcDay(now).getTime() - startOfUtcDay(dueDate).getTime()) /
        DAY_MS,
    ),
  );
}
