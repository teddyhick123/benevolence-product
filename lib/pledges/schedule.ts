export type Frequency = 'one_time' | 'monthly' | 'quarterly' | 'annually' | 'custom';

export interface ScheduleInput {
  totalAmount: number;
  startDate: string;
  endDate?: string;
  frequency: Frequency;
  installmentCount?: number;
}

export interface ScheduledInstallment {
  due_date: string;
  amount: number;
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const anchorDay = d.getUTCDate();
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth();
  const targetMonth = month + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const targetMonthOfYear = targetMonth % 12;
  // Calculate last day of target month
  const lastDay = new Date(Date.UTC(targetYear, targetMonthOfYear + 1, 0)).getUTCDate();
  const day = Math.min(anchorDay, lastDay);
  return new Date(Date.UTC(targetYear, targetMonthOfYear, day)).toISOString().slice(0, 10);
}

function countIntervals(startDate: string, endDate: string, monthsPerInterval: number): number {
  const start = new Date(startDate + 'T12:00:00Z');
  const end   = new Date(endDate   + 'T12:00:00Z');
  const anchorDay = start.getUTCDate();
  let count = 1;
  let monthsAdded = 0;
  while (true) {
    monthsAdded += monthsPerInterval;
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth();
    const targetMonth = month + monthsAdded;
    const targetYear = year + Math.floor(targetMonth / 12);
    const targetMonthOfYear = targetMonth % 12;
    // Calculate last day of target month
    const lastDay = new Date(Date.UTC(targetYear, targetMonthOfYear + 1, 0)).getUTCDate();
    const day = Math.min(anchorDay, lastDay);
    const next = new Date(Date.UTC(targetYear, targetMonthOfYear, day));
    if (next > end) break;
    count++;
  }
  return count;
}

function distributeAmount(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n);
  const remainder = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => i === n - 1 ? base + remainder : base);
}

export function generateSchedule(input: ScheduleInput): ScheduledInstallment[] {
  const { totalAmount, startDate, endDate, frequency, installmentCount } = input;

  if (!totalAmount || totalAmount <= 0) throw new Error('totalAmount must be greater than zero');
  if (!startDate) throw new Error('startDate is required');
  if (endDate && endDate < startDate) throw new Error('endDate must be on or after startDate');
  if (installmentCount !== undefined && !Number.isInteger(installmentCount))
    throw new Error('installmentCount must be an integer');

  if (frequency === 'custom') return [];
  if (frequency === 'one_time') {
    return [{ due_date: startDate, amount: totalAmount }];
  }

  const monthsPerInterval = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12;

  let n: number;
  if (installmentCount && installmentCount > 0) {
    n = installmentCount;
  } else if (endDate) {
    n = countIntervals(startDate, endDate, monthsPerInterval);
  } else {
    throw new Error(`endDate or installmentCount is required for ${frequency} schedules`);
  }

  const totalCents = Math.round(totalAmount * 100);
  const amounts = distributeAmount(totalCents, n);

  return Array.from({ length: n }, (_, i) => ({
    due_date: i === 0 ? startDate : addMonths(startDate, i * monthsPerInterval),
    amount: amounts[i] / 100,
  }));
}
