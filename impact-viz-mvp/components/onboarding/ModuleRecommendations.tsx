'use client';

import { useState, useEffect } from 'react';
import ModuleCard from './ModuleCard';
import { SparklesIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

interface ModuleDefinition {
  id: string;
  name: string;
  description: string;
  icon?: string;
  isCore?: boolean;
}

interface Recommendation {
  module_id: string;
  confidence: number;
  reasoning: string;
  pain_points_addressed: string[];
  goals_addressed: string[];
  module: ModuleDefinition;
}

interface ExcludedModule {
  module_id: string;
  reason: string;
  module: ModuleDefinition;
}

interface ModuleRecommendationsProps {
  sessionId: string;
  onComplete: (selectedModules: string[]) => void;
  isLoading?: boolean;
}

export default function ModuleRecommendations({
  sessionId,
  onComplete,
  isLoading: externalLoading,
}: ModuleRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [excluded, setExcluded] = useState<ExcludedModule[]>([]);
  const [selectedModules, setSelectedModules] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);

  // Fetch recommendations on mount
  useEffect(() => {
    fetchRecommendations();
  }, [sessionId]);

  const fetchRecommendations = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await fetch(`/api/onboarding/recommendations?sessionId=${sessionId}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch recommendations');
      }

      setRecommendations(data.recommendations || []);
      setExcluded(data.excluded || []);

      // Pre-select recommended modules with confidence >= 0.5
      const preSelected = new Set(
        (data.recommendations || [])
          .filter((r: Recommendation) => r.confidence >= 0.5)
          .map((r: Recommendation) => r.module_id)
      );
      setSelectedModules(preSelected);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleModule = (moduleId: string, enabled: boolean) => {
    setSelectedModules(prev => {
      const next = new Set(prev);
      if (enabled) {
        next.add(moduleId);
      } else {
        next.delete(moduleId);
      }
      return next;
    });
  };

  const handleComplete = async () => {
    try {
      // Save selections
      await fetch('/api/onboarding/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          accepted_modules: Array.from(selectedModules),
        }),
      });

      onComplete(Array.from(selectedModules));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save selections');
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <div className="w-16 h-16 mb-4">
          <SparklesIcon className="w-16 h-16 text-azure animate-pulse" />
        </div>
        <h2 className="text-xl font-semibold text-neutral-900 mb-2">
          Generating your recommendations...
        </h2>
        <p className="text-neutral-600">
          Analyzing your needs to find the best modules
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchRecommendations}
          className="px-4 py-2 bg-azure text-white rounded-lg hover:bg-azure/90"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-azure/10 rounded-full mb-4">
          <SparklesIcon className="w-8 h-8 text-azure" />
        </div>
        <h2 className="text-2xl font-semibold text-neutral-900 mb-2">
          Your Personalized Modules
        </h2>
        <p className="text-neutral-600 max-w-lg mx-auto">
          Based on your conversation, we&apos;ve selected the modules that best match your needs.
          You can toggle any module on or off.
        </p>
      </div>

      {/* Summary */}
      <div className="flex items-center justify-center gap-6 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-green-500 rounded-full" />
          <span className="text-neutral-600">
            {selectedModules.size} module{selectedModules.size !== 1 ? 's' : ''} selected
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-azure rounded-full" />
          <span className="text-neutral-600">
            {recommendations.length} recommended
          </span>
        </div>
      </div>

      {/* Recommended Modules */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-neutral-900">
          Recommended for You
        </h3>
        <div className="grid gap-4">
          {recommendations.map((rec) => (
            <ModuleCard
              key={rec.module_id}
              moduleId={rec.module_id}
              module={rec.module}
              confidence={rec.confidence}
              reasoning={rec.reasoning}
              isEnabled={selectedModules.has(rec.module_id)}
              onToggle={toggleModule}
              isRecommended={true}
            />
          ))}
        </div>
      </div>

      {/* Excluded Modules (Collapsible) */}
      {excluded.length > 0 && (
        <div className="border-t border-neutral-200 pt-6">
          <button
            onClick={() => setShowExcluded(!showExcluded)}
            className="flex items-center gap-2 text-neutral-600 hover:text-neutral-900 transition-colors"
          >
            {showExcluded ? (
              <ChevronUpIcon className="w-5 h-5" />
            ) : (
              <ChevronDownIcon className="w-5 h-5" />
            )}
            <span className="font-medium">
              Other Available Modules ({excluded.length})
            </span>
          </button>

          {showExcluded && (
            <div className="mt-4 grid gap-4">
              {excluded.map((exc) => (
                <ModuleCard
                  key={exc.module_id}
                  moduleId={exc.module_id}
                  module={exc.module}
                  isEnabled={selectedModules.has(exc.module_id)}
                  onToggle={toggleModule}
                  isRecommended={false}
                  excludedReason={exc.reason}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-6 border-t border-neutral-200">
        <p className="text-sm text-neutral-500">
          You can always change your modules later in Settings
        </p>
        <button
          onClick={handleComplete}
          disabled={externalLoading || selectedModules.size === 0}
          className="px-8 py-3 bg-azure text-white rounded-lg font-medium hover:bg-azure/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {externalLoading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Setting up...
            </span>
          ) : (
            `Continue with ${selectedModules.size} Module${selectedModules.size !== 1 ? 's' : ''}`
          )}
        </button>
      </div>
    </div>
  );
}
