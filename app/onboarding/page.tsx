import { createServerClient } from '@/lib/api/server-client';
import { redirect } from 'next/navigation';
import OnboardingFlow from '@/components/onboarding/OnboardingFlow';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  // Get authenticated user
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();

  // Redirect to login if not authenticated
  if (!user) {
    redirect('/login?redirect=/onboarding');
  }

  // Check if user has completed onboarding
  const { data: completedSession } = await supabase
    .from('onboarding_sessions')
    .select('id')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .maybeSingle();

  // If already completed, redirect to dashboard
  if (completedSession) {
    redirect('/dashboard');
  }

  // Check for existing in-progress session
  const { data: existingSession } = await supabase
    .from('onboarding_sessions')
    .select(`
      *,
      onboarding_profiles (*),
      onboarding_recommendations (*)
    `)
    .eq('user_id', user.id)
    .not('status', 'in', '("completed","abandoned")')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <OnboardingFlow
      initialSession={existingSession ? {
        id: existingSession.id,
        status: existingSession.status,
        quick_intake: existingSession.quick_intake,
        messages: existingSession.messages,
        conversation_state: existingSession.conversation_state,
        onboarding_profiles: existingSession.onboarding_profiles,
        org_id: existingSession.org_id,
      } : undefined}
    />
  );
}
