'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useState } from 'react';

interface CachedAnalysis {
  content: string;
  generated_at: string;
  version: number;
}

export default function FinancialAnalysisNarrative({
  holdingId,
  cachedAnalysis,
}: {
  holdingId: string;
  cachedAnalysis?: CachedAnalysis | null;
}) {
  const [analysis, setAnalysis] = useState<CachedAnalysis | null>(cachedAnalysis || null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (force = false) => {
    setGenerating(true);
    setError(null);
    try {
      const res = await apiRequest(
        `/api/holdings/${holdingId}/financial-profile/generate${force ? '?force=true' : ''}`,
        { method: 'POST' }
      );
      if (!res.ok) {
        const data = await readJson(res);
        throw new Error(data.error || 'Failed to generate analysis');
      }
      const data = await readJson(res);
      setAnalysis({
        content: data.analysis_content,
        generated_at: data.generated_at,
        version: data.version,
      });
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setGenerating(false);
    }
  };

  // No analysis yet — show generate prompt
  if (!analysis) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg bg-indigo-50">
            <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-neutral-900">AI Financial Analysis</h3>
        </div>
        <p className="text-xs text-neutral-500 mb-4">
          Generate an AI-powered assessment of this organization&apos;s financial health based on public filings and data.
        </p>
        {error && (
          <p className="text-xs text-red-600 mb-3">{error}</p>
        )}
        <button
          onClick={() => handleGenerate(false)}
          disabled={generating}
          className="px-4 py-2 text-sm font-medium text-white bg-azure hover:bg-azure/90 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {generating ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Generate Analysis
            </>
          )}
        </button>
      </div>
    );
  }

  // Show the analysis
  const formattedDate = new Date(analysis.generated_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-50">
            <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-neutral-900">AI Financial Analysis</h3>
        </div>
        <button
          onClick={() => handleGenerate(true)}
          disabled={generating}
          className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-azure border border-neutral-300 hover:border-azure/30 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {generating ? (
            <>
              <div className="w-3 h-3 border-2 border-neutral-300 border-t-neutral-600 rounded-full animate-spin" />
              Regenerating...
            </>
          ) : (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Regenerate
            </>
          )}
        </button>
      </div>

      <div className="px-4 py-4">
        {error && (
          <p className="text-xs text-red-600 mb-3">{error}</p>
        )}
        <div className="text-sm text-neutral-700 leading-relaxed whitespace-pre-line">
          {analysis.content}
        </div>
      </div>

      <div className="px-4 py-2.5 border-t border-neutral-100 bg-neutral-50/50">
        <p className="text-[11px] text-neutral-400">
          Generated {formattedDate} · v{analysis.version} · AI-generated content — verify independently
        </p>
      </div>
    </div>
  );
}
