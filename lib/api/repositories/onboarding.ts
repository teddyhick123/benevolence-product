import {
  createElevatedClient,
  type ElevatedClient,
} from '@/lib/api/admin-client';
import {
  OnboardingAssistant,
  type ConversationState,
  type QuickIntake,
} from '@/lib/onboarding-assistant';

type StoredMessage = {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

type OnboardingSessionScope = {
  sessionId: string;
  userId: string;
  orgId?: string;
  status: string;
  quickIntake: QuickIntake;
  conversationState: ConversationState | undefined;
  messages: StoredMessage[];
  startedAt: string | null;
  intakeCompletedAt: string | null;
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
      status: scope.status,
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

    async chat(message: string) {
      const messages = [...scope.messages, {
        role: 'user' as const,
        content: message,
        timestamp: new Date().toISOString(),
      }];

      await db
        .from('onboarding_sessions')
        .update({ messages })
        .eq('id', scope.sessionId)
        .eq('user_id', scope.userId);

      const assistant = new OnboardingAssistant(db);
      // The assistant receives prior turns only. Including the just-persisted
      // message here would append it a second time inside OnboardingAssistant.
      const conversationHistory = messages.slice(0, -1).map((entry) => ({
        role: entry.role,
        content: entry.content,
      }));
      const result = await assistant.chat({
        sessionId: scope.sessionId,
        userId: scope.userId,
        orgId: scope.orgId,
        message,
        quickIntake: scope.quickIntake,
        conversationHistory,
        conversationState: scope.conversationState,
      });

      messages.push({
        role: 'assistant',
        content: result.message,
        timestamp: new Date().toISOString(),
      });
      const readyForRecommendations = Boolean(
        result.trigger_recommendations || result.updated_state?.ready_for_recommendations
      );
      const updateData: Record<string, unknown> = {
        messages,
        conversation_state: result.updated_state,
      };

      if (readyForRecommendations) {
        updateData.status = 'recommendations';
        updateData.conversation_completed_at = new Date().toISOString();
        if (scope.intakeCompletedAt) {
          const conversationDuration = Math.floor(
            (Date.now() - new Date(scope.intakeCompletedAt).getTime()) / 1000
          );
          await db
            .from('onboarding_analytics')
            .update({ conversation_duration_seconds: conversationDuration })
            .eq('session_id', scope.sessionId);
        }
      }

      await db
        .from('onboarding_sessions')
        .update(updateData)
        .eq('id', scope.sessionId)
        .eq('user_id', scope.userId);

      return { ...result, readyForRecommendations };
    },

    async existingRecommendations() {
      const { data } = await db
        .from('onboarding_recommendations')
        .select('*')
        .eq('session_id', scope.sessionId)
        .maybeSingle();
      return data;
    },

    async generateRecommendations() {
      const assistant = new OnboardingAssistant(db);
      const result = await assistant.generateRecommendations(scope.sessionId);

      await db
        .from('onboarding_sessions')
        .update({
          status: 'recommendations',
          conversation_completed_at: new Date().toISOString(),
        })
        .eq('id', scope.sessionId)
        .eq('user_id', scope.userId);
      await db
        .from('onboarding_analytics')
        .update({ modules_recommended: result.recommendations.length })
        .eq('session_id', scope.sessionId);

      return result;
    },

    async finalizeRecommendations(acceptedModules: string[]) {
      const { data: recommendations } = await db
        .from('onboarding_recommendations')
        .select('recommended_modules')
        .eq('session_id', scope.sessionId)
        .single();
      const originalModules = (recommendations?.recommended_modules || [])
        .map((recommendation: { module_id: string }) => recommendation.module_id);
      const userAdded = acceptedModules.filter((moduleId) => !originalModules.includes(moduleId));
      const userRemoved = originalModules.filter(
        (moduleId: string) => !acceptedModules.includes(moduleId)
      );

      const { error } = await db
        .from('onboarding_recommendations')
        .update({
          final_modules: acceptedModules,
          user_added: userAdded,
          user_removed: userRemoved,
          finalized_at: new Date().toISOString(),
        })
        .eq('session_id', scope.sessionId);
      if (error) throw error;

      await db
        .from('onboarding_analytics')
        .update({
          modules_accepted: acceptedModules.length,
          modules_added: userAdded.length,
          modules_removed: userRemoved.length,
        })
        .eq('session_id', scope.sessionId);

      return {
        finalModules: acceptedModules,
        userAdded,
        userRemoved,
      };
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
        .select('id, user_id, org_id, status, quick_intake, conversation_state, messages, started_at, intake_completed_at')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .maybeSingle();

      if (!data) return null;
      return createSessionRepository(db, {
        sessionId: data.id,
        userId: data.user_id,
        orgId: data.org_id ?? undefined,
        status: data.status,
        quickIntake: data.quick_intake || {},
        conversationState: data.conversation_state || undefined,
        messages: data.messages || [],
        startedAt: data.started_at,
        intakeCompletedAt: data.intake_completed_at,
      });
    },
  };
}

export type OnboardingRepository = ReturnType<typeof createOnboardingRepository>;
