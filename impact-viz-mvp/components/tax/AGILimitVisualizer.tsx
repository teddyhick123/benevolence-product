'use client';

import { getAGILimitCategoryLabel } from '@/lib/tax/agi-calculator';
import type { AGILimits } from '@/lib/tax/agi-calculator';

interface AGILimitVisualizerProps {
  limits: AGILimits;
}

export default function AGILimitVisualizer({ limits }: AGILimitVisualizerProps) {
  const buckets = Object.values(limits.buckets);

  return (
    <div className="border border-gray-200 rounded-lg p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">AGI Deduction Limits</h2>
        <p className="text-sm text-gray-600 mt-1">
          Based on estimated AGI of ${limits.estimatedAGI.toLocaleString()}
        </p>
      </div>

      <div className="space-y-6">
        {buckets.map((bucket) => {
          const percentage = Math.min(100, bucket.percentageUsed);
          const isNearLimit = percentage >= 80;
          const isOverLimit = percentage >= 100;

          return (
            <div key={bucket.category}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  {getAGILimitCategoryLabel(bucket.category)}
                </span>
                <span className="text-sm font-semibold text-gray-900">
                  ${bucket.used.toLocaleString()} / ${bucket.limit.toLocaleString()}
                </span>
              </div>

              {/* Progress Bar */}
              <div className="relative h-8 bg-gray-100 rounded-lg overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    isOverLimit
                      ? 'bg-red-500'
                      : isNearLimit
                      ? 'bg-amber-500'
                      : 'bg-green-500'
                  }`}
                  style={{ width: `${Math.min(100, percentage)}%` }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span
                    className={`text-xs font-semibold ${
                      percentage > 50 ? 'text-white' : 'text-gray-700'
                    }`}
                  >
                    {percentage.toFixed(1)}% used
                  </span>
                </div>
              </div>

              {/* Available Amount */}
              <div className="mt-2 flex items-center justify-between text-xs">
                <span
                  className={
                    isOverLimit
                      ? 'text-red-600 font-medium'
                      : isNearLimit
                      ? 'text-amber-600 font-medium'
                      : 'text-gray-600'
                  }
                >
                  {isOverLimit
                    ? `Over limit by $${(bucket.used - bucket.limit).toLocaleString()}`
                    : `$${bucket.available.toLocaleString()} available`}
                </span>
                <span className="text-gray-500">
                  {bucket.contributions.length}{' '}
                  {bucket.contributions.length === 1 ? 'contribution' : 'contributions'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-gray-600 mb-1">Total Contributions</div>
            <div className="text-xl font-bold text-gray-900">
              ${limits.totalContributions.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-gray-600 mb-1">Deductible This Year</div>
            <div className="text-xl font-bold text-gray-900">
              ${limits.totalDeductible.toLocaleString()}
            </div>
          </div>
        </div>

        {limits.totalCarryforward > 0 && (
          <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
            <div className="text-sm">
              <strong className="text-amber-900">Carryforward:</strong>
              <span className="text-amber-800 ml-2">
                ${limits.totalCarryforward.toLocaleString()} will carry forward to future years (available
                for 5 years)
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
