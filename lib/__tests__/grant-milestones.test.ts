// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { milestoneDisplayStatus, withMilestoneDisplayStatus } from '@/lib/grants/milestones';

const TODAY = new Date('2026-06-28T12:00:00.000Z');

describe('grant milestone display status', () => {
  it('computes overdue from due_date for non-terminal stored statuses', () => {
    expect(milestoneDisplayStatus({ status: 'pending', due_date: '2026-06-27' }, TODAY)).toBe('overdue');
    expect(milestoneDisplayStatus({ status: 'in_progress', due_date: '2026-06-27' }, TODAY)).toBe('overdue');
  });

  it('does not mark terminal or future milestones as overdue', () => {
    expect(milestoneDisplayStatus({ status: 'completed', due_date: '2026-06-27' }, TODAY)).toBe('completed');
    expect(milestoneDisplayStatus({ status: 'cancelled', due_date: '2026-06-27' }, TODAY)).toBe('cancelled');
    expect(milestoneDisplayStatus({ status: 'pending', due_date: '2026-06-28' }, TODAY)).toBe('pending');
    expect(milestoneDisplayStatus({ status: 'pending', due_date: '2026-06-29' }, TODAY)).toBe('pending');
  });

  it('preserves stored_status while returning display status', () => {
    expect(withMilestoneDisplayStatus({ id: 'm-1', status: 'pending', due_date: '2026-06-27' }, TODAY)).toEqual({
      id: 'm-1',
      stored_status: 'pending',
      status: 'overdue',
      due_date: '2026-06-27',
    });
  });
});
