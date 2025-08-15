'use client';
import React from 'react';

type Row = { name: string; nav: number; asset_class: string; last_updated?: string; status?: string };

export default function HoldingsTable({ rows }: { rows: Row[] }) {
  return (
    <div className="border rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left p-2">Holding</th>
            <th className="text-right p-2">NAV</th>
            <th className="text-left p-2">Asset Class</th>
            <th className="text-left p-2">Last Updated</th>
            <th className="text-left p-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t">
              <td className="p-2">{r.name}</td>
              <td className="p-2 text-right">${r.nav.toLocaleString()}</td>
              <td className="p-2">{r.asset_class}</td>
              <td className="p-2">{r.last_updated || '—'}</td>
              <td className="p-2">{r.status || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
