interface CharityNavigatorRating {
  overall_score?: number | null;
  financial_score?: number | null;
  accountability_score?: number | null;
  letter_grade?: string | null;
  rated?: boolean;
}

function StarRating({ score, max = 4 }: { score: number; max?: number }) {
  const filled = Math.round(score);
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <svg
          key={i}
          className={`w-4 h-4 ${i < filled ? 'text-amber-400' : 'text-neutral-200'}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number | null | undefined }) {
  if (score == null) return null;
  const pct = Math.min(100, Math.max(0, score));
  const color =
    pct >= 80 ? 'bg-emerald-500' :
    pct >= 60 ? 'bg-amber-500' :
    'bg-red-500';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-neutral-600">{label}</span>
        <span className="text-xs font-medium text-neutral-900">{pct.toFixed(0)}/100</span>
      </div>
      <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function CharityRatingDisplay({
  rating,
}: {
  rating?: CharityNavigatorRating | null;
}) {
  if (!rating || !rating.rated) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="p-1.5 rounded-lg bg-neutral-50">
            <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-neutral-900">Charity Rating</h3>
        </div>
        <p className="text-xs text-neutral-500">No rating available for this organization.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-50">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-neutral-900">Charity Navigator</h3>
        </div>
        {rating.letter_grade && (
          <span className="px-2.5 py-1 text-sm font-bold rounded-lg bg-emerald-50 text-emerald-700">
            {rating.letter_grade}
          </span>
        )}
      </div>

      {rating.overall_score != null && (
        <div className="mb-3">
          <StarRating score={rating.overall_score / 25} />
          <p className="text-xs text-neutral-500 mt-1">
            Overall: {rating.overall_score.toFixed(0)}/100
          </p>
        </div>
      )}

      <div className="space-y-2">
        <ScoreBar label="Financial" score={rating.financial_score} />
        <ScoreBar label="Accountability" score={rating.accountability_score} />
      </div>
    </div>
  );
}
