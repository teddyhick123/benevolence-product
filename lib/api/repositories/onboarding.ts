import {
  createElevatedClient,
  type ElevatedClient,
} from '@/lib/api/admin-client';
import {
  OnboardingAssistant,
  type ConversationState,
  type QuickIntake,
} from '@/lib/onboarding/assistant';

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

type OnboardingChatResponse = {
  message: string;
  extractions: Record<string, unknown>;
  conversation_state: ConversationState;
  ready_for_recommendations: boolean;
};

type BeginOnboardingTurnResult =
  | { state: 'started'; turnId: string; history: Array<{ role: 'user' | 'assistant'; content: string }> }
  | { state: 'completed'; turnId: string; response: OnboardingChatResponse }
  | { state: 'in_progress' | 'failed'; turnId: string; failureCode?: string; failureMessage?: string };

type BeginTurnRpc = {
  started?: boolean;
  turn_id?: string;
  status?: 'in_progress' | 'completed' | 'failed';
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  response?: OnboardingChatResponse | null;
  failure_code?: string | null;
  failure_message?: string | null;
};

export class OnboardingTurnRepositoryError extends Error {
  readonly status: 400 | 404 | 409;

  constructor(message: string, status: 400 | 404 | 409) {
    super(message);
    this.name = 'OnboardingTurnRepositoryError';
    this.status = status;
  }
}

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

    async beginChatTurn(requestId: string, message: string): Promise<BeginOnboardingTurnResult> {
      const { data, error } = await db.rpc('begin_onboarding_turn', {
        p_session_id: scope.sessionId,
        p_user_id: scope.userId,
        p_request_id: requestId,
        p_content: message,
      });
      if (error) {
        if (error.code === 'P0002') throw new OnboardingTurnRepositoryError('Session not found', 404);
        if (error.code === 'P0001') throw new OnboardingTurnRepositoryError(error.message, 409);
        if (error.code === '22023') throw new OnboardingTurnRepositoryError(error.message, 400);
        throw error;
      }
      const result = (data ?? {}) as BeginTurnRpc;
      if (!result.turn_id || !result.status) throw new Error('Onboarding turn persistence returned an invalid result');
      if (!result.started) {
        if (result.status === 'completed') {
          if (!result.response) throw new Error('Completed onboarding turn is missing its response');
          return { state: 'completed', turnId: result.turn_id, response: result.response };
        }
        return {
          state: result.status,
          turnId: result.turn_id,
          ...(result.failure_code ? { failureCode: result.failure_code } : {}),
          ...(result.failure_message ? { failureMessage: result.failure_message } : {}),
        };
      }
      return { state: 'started', turnId: result.turn_id, history: result.history ?? scope.messages.map(({ role, content }) => ({ role, content })) };
    },

    async chat(turnId: string, message: string, history: Array<{ role: 'user' | 'assistant'; content: string }>) {

      const assistant = new OnboardingAssistant(db);
      const result = await assistant.chat({
        sessionId: scope.sessionId,
        userId: scope.userId,
        orgId: scope.orgId,
        message,
        quickIntake: scope.quickIntake,
        conversationHistory: history,
        conversationState: scope.conversationState,
        persist: false,
      });
      const readyForRecommendations = Boolean(
        result.trigger_recommendations || result.updated_state?.ready_for_recommendations
      );
      const response: OnboardingChatResponse = {
        message: result.message,
        extractions: result.extractions,
        conversation_state: result.updated_state,
        ready_for_recommendations: readyForRecommendations,
      };
      const { data, error } = await db.rpc('complete_onboarding_turn', {
        p_turn_id: turnId,
        p_session_id: scope.sessionId,
        p_user_id: scope.userId,
        p_assistant_content: result.message,
        p_extractions: result.extractions,
        p_conversation_state: result.updated_state,
        p_ready_for_recommendations: readyForRecommendations,
        p_response: response,
      });
      if (error) throw error;
      return data as OnboardingChatResponse;
    },

    async failChatTurn(turnId: string, error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const { error: failError } = await db.rpc('fail_onboarding_turn', {
        p_turn_id: turnId,
        p_session_id: scope.sessionId,
        p_user_id: scope.userId,
        p_failure_code: 'onboarding_chat_failed',
        p_failure_message: message,
      });
      if (failError) throw failError;
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
      const result = await assistant.generateRecommendations(scope.sessionId, { persist: false });
      const { data, error } = await db.rpc('complete_onboarding_recommendations', {
        p_session_id: scope.sessionId,
        p_user_id: scope.userId,
        p_recommendations: result.recommendations,
        p_excluded: result.excluded,
      });
      if (error) throw error;
      return (data as { recommendations: typeof result.recommendations; excluded: typeof result.excluded } | null) ?? result;
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
