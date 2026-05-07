'use client';
// components/admin/MigrationHealthScore.tsx
// Circular migration health score indicator

interface MigrationHealthScoreProps {
  totalRecords: number;
  failedRecords: number;
  reconciliationDeltaPercent?: number;
  hasCriticalErrors?: boolean;
}

function calculateScore(props: MigrationHealthScoreProps): number {
  const { totalRecords, failedRecords, reconciliationDeltaPercent, hasCriticalErrors } = props;

  let score = 100;

  // -1 point per % of failed rows (capped at -30)
  if (totalRecords > 0) {
    const failPercent = (failedRecords / totalRecords) * 100;
    score -= Math.min(30, Math.round(failPercent));
  }

  // -5 if financial reconciliation delta > 1%
  if (reconciliationDeltaPercent !== undefined && reconciliationDeltaPercent > 1) {
    score -= 5;
  }

  // -10 if critical errors remain
  if (hasCriticalErrors) {
    score -= 10;
  }

  // +5 bonus if >90% success rate
  if (totalRecords > 0) {
    const successRate = ((totalRecords - failedRecords) / totalRecords) * 100;
    if (successRate >= 90) {
      score += 5;
    }
  }

  return Math.max(0, Math.min(100, score));
}

function getScoreBand(score: number): {
  label: string;
  color: string;
  textColor: string;
  ringColor: string;
} {
  if (score >= 90) {
    return {
      label: 'Excellent',
      color: '#22c55e',
      textColor: 'text-green-700',
      ringColor: 'stroke-green-500',
    };
  }
  if (score >= 75) {
    return {
      label: 'Good',
      color: '#eab308',
      textColor: 'text-yellow-700',
      ringColor: 'stroke-yellow-500',
    };
  }
  return {
    label: 'Needs Work',
    color: '#ef4444',
    textColor: 'text-red-700',
    ringColor: 'stroke-red-500',
  };
}

export function MigrationHealthScore(props: MigrationHealthScoreProps) {
  const score = calculateScore(props);
  const band = getScoreBand(score);

  // SVG circular progress
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const progress = (score / 100) * circumference;
  const gap = circumference - progress;

  const tooltipText = [
    `Score: ${score}/100`,
    props.totalRecords > 0
      ? `Success rate: ${Math.round(((props.totalRecords - props.failedRecords) / props.totalRecords) * 100)}%`
      : '',
    props.reconciliationDeltaPercent !== undefined && props.reconciliationDeltaPercent > 1
      ? `Financial variance: ${props.reconciliationDeltaPercent.toFixed(1)}% (-5 pts)`
      : '',
    props.hasCriticalErrors ? 'Critical errors present (-10 pts)' : '',
  ]
    .filter(Boolean)
    .join(' | ');

  return (
    <div className="flex items-center gap-3" title={tooltipText}>
      <div className="relative w-20 h-20 flex-shrink-0">
        <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
          {/* Background ring */}
          <circle
            cx="44"
            cy="44"
            r={radius}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth="8"
          />
          {/* Progress ring */}
          <circle
            cx="44"
            cy="44"
            r={radius}
            fill="none"
            stroke={band.color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${progress} ${gap}`}
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold leading-none">{score}</span>
          <span className="text-xs text-neutral-400 leading-none">/100</span>
        </div>
      </div>

      <div>
        <p className={`font-semibold text-sm ${band.textColor}`}>{band.label}</p>
        <p className="text-xs text-neutral-500">Migration health</p>
        {props.totalRecords > 0 && (
          <p className="text-xs text-neutral-400 mt-0.5">
            {(props.totalRecords - props.failedRecords).toLocaleString()} /{' '}
            {props.totalRecords.toLocaleString()} records loaded
          </p>
        )}
      </div>
    </div>
  );
}
