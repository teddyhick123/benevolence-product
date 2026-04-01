'use client';
// components/admin/AIConfidenceBadge.tsx
// Reusable confidence badge for AI mapping suggestions

interface AIConfidenceBadgeProps {
  confidence?: number; // 0-1, undefined = no suggestion
  showLabel?: boolean;
}

export function AIConfidenceBadge({ confidence, showLabel = true }: AIConfidenceBadgeProps) {
  if (confidence === undefined) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-neutral-200 bg-neutral-50 text-neutral-400">
        <span className="w-1.5 h-1.5 rounded-full bg-neutral-300 inline-block" />
        {showLabel && 'No AI match'}
      </span>
    );
  }

  const pct = Math.round(confidence * 100);

  let colorClasses: string;
  let dotColor: string;

  if (confidence >= 0.85) {
    colorClasses = 'border-green-200 bg-green-50 text-green-700';
    dotColor = 'bg-green-500';
  } else if (confidence >= 0.70) {
    colorClasses = 'border-yellow-200 bg-yellow-50 text-yellow-700';
    dotColor = 'bg-yellow-500';
  } else {
    colorClasses = 'border-red-200 bg-red-50 text-red-700';
    dotColor = 'bg-red-500';
  }

  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${colorClasses}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor} inline-block`} />
      {`${pct}%`}
    </span>
  );
}
