import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { redirect } from 'next/navigation';
import OnboardingFlow from '@/components/onboarding/OnboardingFlow';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  // Get authenticated user
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string) {
          cookieStore.delete(name);
        },
      },
    }
  );

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
        organization_id: existingSession.organization_id,
      } : undefined}
    />
  );
}
