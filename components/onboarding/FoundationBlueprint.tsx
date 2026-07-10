'use client';

import { CheckCircleIcon, SparklesIcon } from '@heroicons/react/24/outline';

type Intake = {
  org_name?: string;
  org_size?: string;
  primary_focus?: string[];
};

export type FoundationBlueprintData = {
  pain_points: Array<{ id?: string; description: string }>;
  goals: Array<{ id?: string; goal: string }>;
  workflows: Record<string, unknown>;
  team_context: Record<string, unknown>;
};

interface FoundationBlueprintProps {
  intake?: Intake;
  blueprint: FoundationBlueprintData;
  messageCount: number;
  onReviewSetup: () => void;
}

function firstLabel(values: Array<{ description?: string; goal?: string }>) {
  const first = values[0];
  return first?.description || first?.goal || null;
}

export default function FoundationBlueprint({ intake, blueprint, messageCount, onReviewSetup }: FoundationBlueprintProps) {
  const challenge = firstLabel(blueprint.pain_points);
  const goal = firstLabel(blueprint.goals);
  const workflowCount = Object.keys(blueprint.workflows).length;
  const hasSignal = Boolean(challenge || goal || workflowCount);

  return (
    <aside className="w-80 flex-shrink-0">
      <div className="border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center bg-azure text-white">
            <SparklesIcon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-neutral-900">Foundation Blueprint</h2>
            <p className="mt-0.5 text-xs text-neutral-500">A working draft, shaped as you talk.</p>
          </div>
        </div>

        <div className="mt-5 space-y-4 border-t border-neutral-100 pt-4 text-sm">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Operating Space</p>
            <p className="mt-1 font-medium text-neutral-800">{intake?.org_name || 'Your foundation'}</p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {intake?.org_size ? `${intake.org_size} team` : 'Team details still to come'}
              {intake?.primary_focus?.[0] ? ` · ${intake.primary_focus[0]}` : ''}
            </p>
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">What We Heard</p>
            {hasSignal ? (
              <div className="mt-2 space-y-2">
                {challenge && <p className="text-xs leading-5 text-neutral-700"><span className="font-medium">Challenge:</span> {challenge}</p>}
                {goal && <p className="text-xs leading-5 text-neutral-700"><span className="font-medium">Outcome:</span> {goal}</p>}
                {workflowCount > 0 && <p className="text-xs text-neutral-700"><span className="font-medium">Workflows:</span> {workflowCount} captured</p>}
              </div>
            ) : (
              <p className="mt-2 text-xs leading-5 text-neutral-500">Share the outcome you want and the work that gets in the way. We’ll turn it into a setup plan.</p>
            )}
          </div>

          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Setup Will Shape</p>
            <ul className="mt-2 space-y-1.5 text-xs text-neutral-600">
              {['Your dashboard priorities', 'Workflows and follow-ups', 'Vocabulary and AI memory'].map((item) => (
                <li key={item} className="flex items-center gap-2"><CheckCircleIcon className="h-3.5 w-3.5 text-azure" />{item}</li>
              ))}
            </ul>
          </div>
        </div>

        {messageCount >= 2 && (
          <button onClick={onReviewSetup} className="mt-5 w-full border border-azure px-3 py-2 text-xs font-medium text-azure hover:bg-azure/5">
            Review initial setup
          </button>
        )}
      </div>
    </aside>
  );
}
