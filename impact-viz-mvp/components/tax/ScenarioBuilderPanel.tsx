'use client';

import * as React from 'react';
import TaxScenarioModeler from './TaxScenarioModeler';

export interface ScenarioBuilderPanelProps {
  portfolioId: string;
  year: number;
  initialMode?: 'single' | 'compare' | 'optimal' | 'bunching';
}

export default function ScenarioBuilderPanel({
  portfolioId,
  year,
  initialMode,
}: ScenarioBuilderPanelProps) {
  return (
    <div className="space-y-6">
      {/* Tab Description */}
      <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-6">
        <h3 className="text-lg font-bold text-blue-900 mb-2">
          🔬 Manual Scenario Analysis
        </h3>
        <p className="text-sm text-blue-700 mb-4">
          Model "what-if" scenarios with full control over parameters. Compare different donation
          amounts, asset types, and timing strategies to find what works best for your situation.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="px-3 py-2 bg-white rounded-lg text-blue-700">
            <div className="font-bold mb-1">Single</div>
            <div className="text-blue-600">Analyze one donation</div>
          </div>
          <div className="px-3 py-2 bg-white rounded-lg text-blue-700">
            <div className="font-bold mb-1">Compare</div>
            <div className="text-blue-600">Side-by-side comparison</div>
          </div>
          <div className="px-3 py-2 bg-white rounded-lg text-blue-700">
            <div className="font-bold mb-1">Optimal</div>
            <div className="text-blue-600">Max AGI utilization</div>
          </div>
          <div className="px-3 py-2 bg-white rounded-lg text-blue-700">
            <div className="font-bold mb-1">Bunching</div>
            <div className="text-blue-600">Spread vs. bunch</div>
          </div>
        </div>
      </div>

      {/* Wrapped Scenario Modeler */}
      <TaxScenarioModeler portfolioId={portfolioId} year={year} />
    </div>
  );
}
