'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import QuickIntakeForm, { QuickIntakeData } from './QuickIntakeForm';
import OnboardingChat from './OnboardingChat';
import ModuleRecommendations from './ModuleRecommendations';
import OnboardingComplete from './OnboardingComplete';

type OnboardingStep = 'intake' | 'conversation' | 'recommendations' | 'complete';

interface Session {
  id: string;
  status: OnboardingStep;
  quick_intake?: QuickIntakeData;
  messages?: Array<{ role: 'user' | 'assistant'; content: string; timestamp: string }>;
  conversation_state?: {
    topics_covered: string[];
    confidence_scores: {
      pain_points: number;
      goals: number;
      workflows: number;
      team: number;
    };
    message_count: number;
    ready_for_recommendations: boolean;
  };
  organization_id?: string;
}

interface OnboardingFlowProps {
  initialSession?: Session;
}

export default function OnboardingFlow({ initialSession }: OnboardingFlowProps) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(initialSession || null);
  const [step, setStep] = useState<OnboardingStep>(initialSession?.status || 'intake');
  const [isLoading, setIsLoading] = useState(!initialSession);
  const [enabledModules, setEnabledModules] = useState<string[]>([]);

  // Load or create session on mount
  useEffect(() => {
    if (!initialSession) {
      const controller = new AbortController();
      loadOrCreateSession(controller.signal);
      return () => controller.abort();
    }
  }, []);

  const loadOrCreateSession = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);

      // Try to get existing session
      const getRes = await fetch('/api/onboarding/session', { signal });
      const getData = await getRes.json();
      if (signal?.aborted) return;

      if (getData.session) {
        setSession(getData.session);
        setStep(getData.session.status || 'intake');
      } else {
        // Create new session
        const createRes = await fetch('/api/onboarding/session', { method: 'POST', signal });
        const createData = await createRes.json();
        if (signal?.aborted) return;

        if (createData.session) {
          setSession(createData.session);
          setStep('intake');
        }
      }
    } catch (err) {
      if (signal?.aborted) return;
      console.error('Error loading session:', err);
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  };

  const handleIntakeComplete = async (data: QuickIntakeData) => {
    if (!session) return;

    try {
      setIsLoading(true);

      const res = await fetch('/api/onboarding/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          ...data,
        }),
      });

      const result = await res.json();

      if (res.ok) {
        // Use welcome message from API response
        setSession({
          ...session,
          quick_intake: data,
          status: 'conversation',
          messages: result.messages || [],
        });
        setStep('conversation');
      } else {
        console.error('Intake failed:', result.error);
      }
    } catch (err) {
      console.error('Error saving intake:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReadyForRecommendations = () => {
    setStep('recommendations');
    // Update session status
    if (session) {
      setSession({ ...session, status: 'recommendations' });
    }
  };

  const handleModulesSelected = async (selectedModules: string[]) => {
    if (!session) return;

    try {
      setIsLoading(true);

      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          modules: selectedModules,
        }),
      });

      const result = await res.json();

      if (res.ok) {
        setEnabledModules(result.enabled_modules || selectedModules);
        setSession({
          ...session,
          status: 'complete',
          organization_id: result.organization_id,
        });
        setStep('complete');
      } else {
        console.error('Complete failed:', result.error);
      }
    } catch (err) {
      console.error('Error completing onboarding:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading && !session) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-azure border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-neutral-600">Loading your onboarding session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Step indicator */}
      {step !== 'complete' && (
        <div className="flex-shrink-0 mb-6">
          <div className="flex items-center justify-center">
            {(['intake', 'conversation', 'recommendations'] as const).map((s, i) => {
              const steps = ['intake', 'conversation', 'recommendations'] as const;
              const stepLabels = ['Quick Setup', 'Chat', 'Modules'];
              const currentIndex = steps.indexOf(step);
              const isComplete = currentIndex > i;
              const isCurrent = step === s;

              return (
                <div key={s} className="flex items-center">
                  {/* Step with label */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`
                        w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium
                        ${isCurrent
                          ? 'bg-azure text-white'
                          : isComplete
                            ? 'bg-green-500 text-white'
                            : 'bg-neutral-200 text-neutral-500'
                        }
                      `}
                    >
                      {isComplete ? (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        i + 1
                      )}
                    </div>
                    <span
                      className={`mt-2 text-sm ${
                        isCurrent ? 'text-azure font-medium' : 'text-neutral-500'
                      }`}
                    >
                      {stepLabels[i]}
                    </span>
                  </div>
                  {/* Connector line */}
                  {i < 2 && (
                    <div
                      className={`w-16 h-1 mx-3 mt-[-20px] ${
                        isComplete ? 'bg-green-500' : 'bg-neutral-200'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {step === 'intake' && (
          <QuickIntakeForm onSubmit={handleIntakeComplete} isLoading={isLoading} />
        )}

        {step === 'conversation' && session && (
          <OnboardingChat
            sessionId={session.id}
            initialMessages={session.messages || []}
            initialState={session.conversation_state}
            onReadyForRecommendations={handleReadyForRecommendations}
          />
        )}

        {step === 'recommendations' && session && (
          <ModuleRecommendations
            sessionId={session.id}
            onComplete={handleModulesSelected}
            isLoading={isLoading}
          />
        )}

        {step === 'complete' && (
          <OnboardingComplete
            organizationId={session?.organization_id}
            enabledModules={enabledModules}
          />
        )}
      </div>
    </div>
  );
}
