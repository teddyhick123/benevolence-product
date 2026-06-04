'use client';

import * as React from 'react';
import TaxOptimizationEngine from './TaxOptimizationEngine';

export interface AIAdvisorPanelProps {
  portfolioId: string;
  year: number;
  onOpenScenarioBuilder: () => void;
}

export default function AIAdvisorPanel({
  portfolioId,
  year,
  onOpenScenarioBuilder,
}: AIAdvisorPanelProps) {
  return (
    <div className="space-y-6">
      {/* Tab Description */}
      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-6">
        <h3 className="text-lg font-bold text-indigo-900 mb-2">
          AI-Powered Strategy Recommendations
        </h3>
        <p className="text-sm text-indigo-700 mb-4">
          Our AI analyzes your actual portfolio holdings, tax situation, and giving goals to
          generate ranked donation strategies with confidence scores and specific recommendations.
        </p>
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="px-3 py-1 bg-white rounded-full text-indigo-700 font-medium">Analyzes real holdings</span>
          <span className="px-3 py-1 bg-white rounded-full text-indigo-700 font-medium">Multi-year projections</span>
          <span className="px-3 py-1 bg-white rounded-full text-indigo-700 font-medium">Asset-specific advice</span>
          <span className="px-3 py-1 bg-white rounded-full text-indigo-700 font-medium">Confidence scoring</span>
        </div>
      </div>

      {/* Link to Scenario Builder */}
      <div className="bg-azure/10 border border-azure/20 rounded-lg p-4 flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm text-ink font-medium mb-2">
            Want to test specific scenarios manually?
          </p>
          <button
            onClick={onOpenScenarioBuilder}
            className="text-sm text-azure/90 underline hover:text-azure"
          >
            Switch to Scenario Builder →
          </button>
        </div>
      </div>

      {/* Wrapped Optimization Engine */}
      <TaxOptimizationEngine portfolioId={portfolioId} year={year} />
    </div>
  );
}
