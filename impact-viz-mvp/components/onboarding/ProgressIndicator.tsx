'use client';

interface ConversationState {
  topics_covered: string[];
  confidence_scores: {
    pain_points: number;
    goals: number;
    workflows: number;
    team: number;
  };
  message_count: number;
  ready_for_recommendations: boolean;
}

interface ProgressIndicatorProps {
  conversationState: ConversationState;
}

const CONFIDENCE_LABELS: Record<string, string> = {
  pain_points: 'Challenges',
  goals: 'Goals',
  workflows: 'Workflows',
  team: 'Team',
};

export default function ProgressIndicator({ conversationState }: ProgressIndicatorProps) {
  const { message_count = 0, ready_for_recommendations = false } = conversationState || {};

  // Default confidence scores if not provided
  const confidence_scores = conversationState?.confidence_scores || {
    pain_points: 0,
    goals: 0,
    workflows: 0,
    team: 0,
  };

  // Calculate overall progress
  const scores = Object.values(confidence_scores);
  const avgConfidence = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-900">Understanding Your Needs</h3>
        <span className="text-xs text-neutral-500">
          {message_count} message{message_count !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Overall progress */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-neutral-600">Overall Progress</span>
          <span className="text-xs font-medium text-azure">
            {Math.round(avgConfidence * 100)}%
          </span>
        </div>
        <div className="h-2 bg-neutral-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-azure transition-all duration-500"
            style={{ width: `${avgConfidence * 100}%` }}
          />
        </div>
      </div>

      {/* Individual confidence scores */}
      <div className="grid grid-cols-2 gap-3">
        {Object.entries(confidence_scores).map(([key, value]) => (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-neutral-600">
                {CONFIDENCE_LABELS[key] || key}
              </span>
              <span className={`text-xs font-medium ${value >= 0.7 ? 'text-green-600' : 'text-neutral-500'}`}>
                {Math.round(value * 100)}%
              </span>
            </div>
            <div className="h-1.5 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  value >= 0.7 ? 'bg-green-500' : 'bg-neutral-300'
                }`}
                style={{ width: `${value * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Ready indicator */}
      {ready_for_recommendations && (
        <div className="flex items-center gap-2 pt-2 border-t border-neutral-100">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-xs text-green-600 font-medium">
            Ready to see recommendations
          </span>
        </div>
      )}

      {!ready_for_recommendations && avgConfidence >= 0.5 && (
        <p className="text-xs text-neutral-500 pt-2 border-t border-neutral-100">
          Keep chatting! We&apos;re learning more about your needs.
        </p>
      )}
    </div>
  );
}
