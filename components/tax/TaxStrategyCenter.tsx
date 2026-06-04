'use client';

import * as React from 'react';
import QuickStartPanel from './QuickStartPanel';
import AIAdvisorPanel from './AIAdvisorPanel';
import ScenarioBuilderPanel from './ScenarioBuilderPanel';

export interface TaxStrategyCenterProps {
  portfolioId: string;
  year?: number;
}

type Tab = 'quick-start' | 'ai-advisor' | 'scenario-builder';

export default function TaxStrategyCenter({
  portfolioId,
  year = new Date().getFullYear(),
}: TaxStrategyCenterProps) {
  const [activeTab, setActiveTab] = React.useState<Tab>('quick-start');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-6">
        <h2 className="text-2xl font-bold text-neutral-900">Tax Strategy Center</h2>
        <p className="text-sm text-neutral-600 mt-1">
          AI-powered optimization, scenario modeling, and strategic planning for your charitable giving
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-2">
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => setActiveTab('quick-start')}
            className={`px-4 py-3 rounded-2xl font-medium transition-all ${
              activeTab === 'quick-start'
                ? 'bg-azure text-white shadow-md'
                : 'bg-white text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            <div className="text-sm font-medium">Quick Start</div>
          </button>

          <button
            onClick={() => setActiveTab('ai-advisor')}
            className={`px-4 py-3 rounded-2xl font-medium transition-all ${
              activeTab === 'ai-advisor'
                ? 'bg-azure text-white shadow-md'
                : 'bg-white text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            <div className="text-sm font-medium">AI Strategy Advisor</div>
          </button>

          <button
            onClick={() => setActiveTab('scenario-builder')}
            className={`px-4 py-3 rounded-2xl font-medium transition-all ${
              activeTab === 'scenario-builder'
                ? 'bg-azure text-white shadow-md'
                : 'bg-white text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            <div className="text-sm font-medium">Scenario Builder</div>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="min-h-[500px]">
        {activeTab === 'quick-start' && (
          <QuickStartPanel
            portfolioId={portfolioId}
            year={year}
            onSelectMode={(mode) => {
              setActiveTab('scenario-builder');
              // Pass mode to scenario builder via state if needed
            }}
          />
        )}

        {activeTab === 'ai-advisor' && (
          <AIAdvisorPanel
            portfolioId={portfolioId}
            year={year}
            onOpenScenarioBuilder={() => setActiveTab('scenario-builder')}
          />
        )}

        {activeTab === 'scenario-builder' && (
          <ScenarioBuilderPanel
            portfolioId={portfolioId}
            year={year}
          />
        )}
      </div>
    </div>
  );
}
