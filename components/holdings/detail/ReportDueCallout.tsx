export default function ReportDueCallout({ dueAt }: { dueAt?: string | null }) {
  if (!dueAt) return null;

  const due = new Date(dueAt);
  const daysLeft = Math.ceil((due.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const overdue = daysLeft < 0;
  const urgent = daysLeft >= 0 && daysLeft <= 30;
  const className = overdue
    ? 'bg-red-50 border-red-200 text-red-800'
    : urgent
      ? 'bg-sunset/15 border-sunset/30 text-ink'
      : 'bg-azure/10 border-azure/20 text-azure-deep';

  return (
    <div className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm ${className}`}>
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      <span>
        <span className="font-medium">Next report due:</span>{' '}
        {due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        {overdue
          ? ` — ${Math.abs(daysLeft)} days overdue`
          : daysLeft === 0
            ? ' — due today'
            : ` — ${daysLeft} days remaining`}
      </span>
    </div>
  );
}
