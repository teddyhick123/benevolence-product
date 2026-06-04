'use client';

import * as React from 'react';

export interface QuickStartPanelProps {
  portfolioId: string;
  year: number;
  onSelectMode: (mode: 'optimal' | 'bunching' | 'compare' | 'ai-optimize') => void;
}

interface QuickAction {
  id: string;
  question: string;
  description: string;
  mode: 'optimal' | 'bunching' | 'compare' | 'ai-optimize';
  color: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  {
    id: 'max-donation',
    question: 'How much can I donate without carryforward?',
    description: 'Find the optimal donation amount that maxes out your AGI limit this year',
    mode: 'optimal',
    color: 'from-green-50 to-green-100 border-green-200',
  },
  {
    id: 'bunching',
    question: 'Should I bunch my donations this year?',
    description: 'Compare spreading donations annually vs. bunching every other year',
    mode: 'bunching',
    color: 'from-coral/10 to-azure/10 border-coral/25',
  },
  {
    id: 'asset-comparison',
    question: 'Cash vs. stock donation — which is better?',
    description: 'Compare tax savings across different asset types side-by-side',
    mode: 'compare',
    color: 'from-azure/10 to-azure/5 border-azure/20',
  },
  {
    id: 'ai-optimize',
    question: 'What\'s my optimal giving strategy?',
    description: 'Get AI-powered recommendations based on your portfolio and tax situation',
    mode: 'ai-optimize',
    color: 'from-azure/10 to-coral/10 border-azure/20',
  },
];

export default function QuickStartPanel({
  portfolioId,
  year,
  onSelectMode,
}: QuickStartPanelProps) {
  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="bg-gradient-to-br from-azure/10 to-azure/5 border border-azure/20 rounded-2xl p-6">
        <h3 className="text-lg font-bold text-ink mb-2">
          Get Instant Answers to Common Tax Questions
        </h3>
        <p className="text-sm text-azure-deep">
          Select a question below to instantly run the appropriate analysis. Each tool is
          optimized for a specific type of tax planning scenario.
        </p>
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {QUICK_ACTIONS.map((action) => (
          <button
            key={action.id}
            onClick={() => onSelectMode(action.mode)}
            className={`bg-gradient-to-br ${action.color} border rounded-2xl p-6 text-left hover:shadow-lg transition-all transform hover:-translate-y-1`}
          >
            <h4 className="font-bold text-neutral-900 mb-2 text-lg">{action.question}</h4>
            <p className="text-sm text-neutral-700">{action.description}</p>
            <div className="mt-4 inline-flex items-center text-sm font-medium text-azure">
              Run Analysis →
            </div>
          </button>
        ))}
      </div>

      {/* Help Section */}
      <div className="bg-white border border-neutral-200 rounded-2xl p-6">
        <h3 className="font-semibold text-neutral-900 mb-4">Not sure which to choose?</h3>
        <div className="space-y-3 text-sm text-neutral-700">
          <div className="flex gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 flex-shrink-0" />
            <div>
              <strong>Optimal Amount:</strong> Best if you want to maximize your current year
              deduction without creating carryforward. Perfect for donors who want to stay within
              AGI limits.
            </div>
          </div>
          <div className="flex gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-coral mt-2 flex-shrink-0" />
            <div>
              <strong>Bunching Strategy:</strong> Best if your donations are close to the standard
              deduction threshold. Can save taxes by alternating between itemizing and taking the
              standard deduction.
            </div>
          </div>
          <div className="flex gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-azure mt-2 flex-shrink-0" />
            <div>
              <strong>Comparison:</strong> Best when you have multiple options (e.g., different
              asset types, amounts, or timing) and want to see them side-by-side.
            </div>
          </div>
          <div className="flex gap-3">
            <span className="w-1.5 h-1.5 rounded-full bg-azure mt-2 flex-shrink-0" />
            <div>
              <strong>AI Strategy Advisor:</strong> Best for comprehensive optimization. Analyzes
              your actual holdings and generates ranked strategies with specific recommendations.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
