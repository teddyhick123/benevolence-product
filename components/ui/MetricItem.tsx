/**
 * MetricItem - Shared component for displaying metrics
 *
 * Used across portfolio summaries, performance cards, and grant summaries
 * to display key metrics with optional badges and help text.
 *
 * @example
 * <MetricItem
 *   label="Total Value"
 *   value="$1,234,567"
 *   badge="Active"
 *   badgeColor="green"
 *   helpText="As of Dec 2024"
 * />
 */

type BadgeColor = 'neutral' | 'amber' | 'green' | 'blue' | 'red';

interface MetricItemProps {
  /** Label text displayed above the value */
  label: string;

  /** Main value to display (typically a formatted number or string) */
  value: string;

  /** Optional custom className for the value element (e.g., for custom sizing) */
  valueClassName?: string;

  /** Optional help text or sublabel displayed below the value */
  helpText?: string;

  /** Optional badge text displayed next to the label */
  badge?: string;

  /** Badge color variant (defaults to 'green') */
  badgeColor?: BadgeColor;
}

export default function MetricItem({
  label,
  value,
  valueClassName,
  helpText,
  badge,
  badgeColor = 'green',
}: MetricItemProps) {
  // Badge color mapping
  const badgeColorClass = {
    neutral: 'bg-neutral-50 text-neutral-700 border-neutral-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    green: 'bg-green-50 text-green-700 border-green-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    red: 'bg-red-50 text-red-700 border-red-200',
  }[badgeColor];

  return (
    <div className="flex flex-col">
      {/* Label and optional badge */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-xs text-neutral-600">{label}</span>
        {badge && (
          <span
            className={`text-[10px] px-1.5 py-0.5 rounded-full border ${badgeColorClass}`}
          >
            {badge}
          </span>
        )}
      </div>

      {/* Main value */}
      <div
        className={
          valueClassName || 'text-xl font-semibold tabular-nums text-neutral-900'
        }
      >
        {value}
      </div>

      {/* Optional help text or sublabel */}
      {helpText && (
        <div className="text-xs text-neutral-500 mt-1">{helpText}</div>
      )}
    </div>
  );
}
