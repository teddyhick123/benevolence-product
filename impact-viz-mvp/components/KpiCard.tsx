import React from 'react';

type Props = { title: string; value: string | number; delta?: number; lastUpdated?: string; badge?: string };
export default function KpiCard({ title, value, delta, lastUpdated, badge }: Props) {
  return (
    <div className="border rounded-xl p-4 shadow-sm flex flex-col gap-1">
      <div className="text-sm text-gray-600 flex justify-between">
        <span>{title}</span>
        {badge && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100">{badge}</span>}
      </div>
      <div className="text-2xl font-semibold">{value}</div>
      {typeof delta === 'number' && (
        <div className={`text-sm ${delta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(2)} since last period
        </div>
      )}
      {lastUpdated && <div className="text-xs text-gray-400">Updated {lastUpdated}</div>}
    </div>
  );
}
