import { describe, it, expect } from 'vitest';
import { generateSchedule } from './schedule';

describe('generateSchedule', () => {
  it('one_time creates a single installment for the full amount', () => {
    const result = generateSchedule({ totalAmount: 1000, startDate: '2026-01-15', frequency: 'one_time' });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ due_date: '2026-01-15', amount: 1000 });
  });

  it('monthly even split', () => {
    const result = generateSchedule({ totalAmount: 1200, startDate: '2026-01-15', endDate: '2026-04-15', frequency: 'monthly' });
    expect(result).toHaveLength(4);
    expect(result.every(r => r.amount === 300)).toBe(true);
    expect(result.map(r => r.due_date)).toEqual(['2026-01-15','2026-02-15','2026-03-15','2026-04-15']);
  });

  it('monthly uneven split — penny remainder goes on last installment', () => {
    const result = generateSchedule({ totalAmount: 100, startDate: '2026-01-01', endDate: '2026-03-01', frequency: 'monthly' });
    expect(result).toHaveLength(3);
    const sum = result.reduce((a, r) => a + r.amount, 0);
    expect(sum).toBeCloseTo(100, 10);
    // 33.33 + 33.33 + 33.34
    expect(result[2].amount).toBeGreaterThanOrEqual(result[0].amount);
  });

  it('quarterly schedule', () => {
    const result = generateSchedule({ totalAmount: 4000, startDate: '2026-01-01', endDate: '2026-10-01', frequency: 'quarterly' });
    expect(result).toHaveLength(4);
    expect(result.map(r => r.due_date)).toEqual(['2026-01-01','2026-04-01','2026-07-01','2026-10-01']);
  });

  it('annually schedule', () => {
    const result = generateSchedule({ totalAmount: 3000, startDate: '2026-01-01', endDate: '2028-01-01', frequency: 'annually' });
    expect(result).toHaveLength(3);
    expect(result.map(r => r.due_date)).toEqual(['2026-01-01','2027-01-01','2028-01-01']);
  });

  it('clamps end-of-month dates — Jan 31 monthly goes to Feb 28', () => {
    const result = generateSchedule({ totalAmount: 200, startDate: '2026-01-31', endDate: '2026-02-28', frequency: 'monthly' });
    expect(result).toHaveLength(2);
    expect(result[1].due_date).toBe('2026-02-28');
  });

  it('installmentCount override ignores endDate and produces correct dates', () => {
    const result = generateSchedule({ totalAmount: 600, startDate: '2026-01-01', frequency: 'monthly', installmentCount: 3 });
    expect(result).toHaveLength(3);
    expect(result.map(r => r.due_date)).toEqual(['2026-01-01','2026-02-01','2026-03-01']);
    expect(result.every(r => r.amount === 200)).toBe(true);
  });

  it('leap year — Jan 31 annual goes to Jan 31 (leap year passes through)', () => {
    const result = generateSchedule({ totalAmount: 200, startDate: '2028-01-31', endDate: '2029-01-31', frequency: 'annually' });
    expect(result).toHaveLength(2);
    expect(result[0].due_date).toBe('2028-01-31');
    expect(result[1].due_date).toBe('2029-01-31');
  });

  it('custom returns empty array', () => {
    const result = generateSchedule({ totalAmount: 500, startDate: '2026-01-01', frequency: 'custom' });
    expect(result).toEqual([]);
  });

  it('throws on negative total', () => {
    expect(() => generateSchedule({ totalAmount: -100, startDate: '2026-01-01', frequency: 'one_time' })).toThrow();
  });

  it('throws when endDate is before startDate', () => {
    expect(() => generateSchedule({ totalAmount: 1000, startDate: '2026-06-01', endDate: '2026-01-01', frequency: 'monthly' })).toThrow();
  });
});
