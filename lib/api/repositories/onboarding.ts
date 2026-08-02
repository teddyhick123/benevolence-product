import {
  createElevatedClient,
  type ElevatedClient,
} from '@/lib/api/admin-client';

type OnboardingSessionScope = {
  sessionId: string;
  userId: string;
  quickIntake: unknown;
  conversationState: unknown;
  startedAt: string | null;
};

type IntakeMessage = {
  role: 'assistant';
  content: string;
  timestamp: string;
};

export type OnboardingSessionRepository = ReturnType<typeof createSessionRepository>;

function createSessionRepository(db: ElevatedClient, scope: OnboardingSessionScope) {
  return {
    scope: {
      sessionId: scope.sessionId,
      quickIntake: scope.quickIntake,
      conversationState: scope.conversationState,
    },

    async profile() {
      const { data, error } = await db
        .from('onboarding_profiles')
        .select('*')
        .eq('session_id', scope.sessionId)
        .single();
      if (error) throw error;
      return data;
    },

    async saveIntake(quickIntake: Record<string, unknown>, messages: IntakeMessage[]) {
      const { error } = await db
        .from('onboarding_sessions')
        .update({
          quick_intake: quickIntake,
          messages,
          status: 'conversation',
          intake_completed_at: new Date().toISOString(),
        })
        .eq('id', scope.sessionId)
        .eq('user_id', scope.userId);
      if (error) throw error;

      if (scope.startedAt) {
        const intakeDuration = Math.floor(
          (Date.now() - new Date(scope.startedAt).getTime()) / 1000
        );
        await db
          .from('onboarding_analytics')
          .update({ intake_duration_seconds: intakeDuration })
          .eq('session_id', scope.sessionId);
      }
    },
  };
}

export function createOnboardingRepository(userId: string) {
  const db = createElevatedClient();

  return {
    async latestSession() {
      const { data, error } = await db
        .from('onboarding_sessions')
        .select(`
          *,
          onboarding_profiles (*),
          onboarding_recommendations (*)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },

    async getOrCreateSession() {
      const { data: sessionId, error: rpcError } = await db.rpc(
        'get_or_create_onboarding_session',
        { p_user_id: userId }
      );
      if (rpcError) throw rpcError;

      const { data, error } = await db
        .from('onboarding_sessions')
        .select(`
          *,
          onboarding_profiles (*),
          onboarding_recommendations (*)
        `)
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single();
      if (error) throw error;
      return data;
    },

    async resolveSession(sessionId: string): Promise<OnboardingSessionRepository | null> {
      const { data } = await db
        .from('onboarding_sessions')
        .select('id, user_id, quick_intake, conversation_state, started_at')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!data) return null;
      return createSessionRepository(db, {
        sessionId: data.id,
        userId: data.user_id,
        quickIntake: data.quick_intake,
        conversationState: data.conversation_state,
        startedAt: data.started_at,
      });
    },
  };
}

export type OnboardingRepository = ReturnType<typeof createOnboardingRepository>;
