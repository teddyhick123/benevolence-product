import { createElevatedClient } from '@/lib/api/admin-client';
import type { PortfolioAccessContext } from '@/lib/api/principals';

type AiChatScope = Pick<
  PortfolioAccessContext,
  'db' | 'orgId' | 'portfolioId' | 'principal'
>;

export type PersistedChatMessage = Record<string, unknown> & {
  role: 'user' | 'assistant';
  content: unknown;
  timestamp: string;
};

type UsageRecord = {
  model: string;
  inputTokens: number;
  outputTokens: number;
};

/** Chat persistence scoped to one authenticated user and portfolio. */
export function createAiChatRepository(scope: AiChatScope) {
  const db = scope.db;
  const userId = scope.principal.userId;

  return {
    async start(message: string) {
      const { data: sessionId, error: sessionError } = await db.rpc(
        'get_or_create_ai_session',
        {
          p_portfolio_id: scope.portfolioId,
          p_user_id: userId,
        }
      );
      if (sessionError) throw sessionError;
      if (!sessionId) throw new Error('Failed to create AI session');

      const { data: session, error: readError } = await db
        .from('ai_sessions')
        .select('messages')
        .eq('id', sessionId)
        .eq('portfolio_id', scope.portfolioId)
        .eq('user_id', userId)
        .single();
      if (readError) throw readError;

      const messages = Array.isArray(session?.messages)
        ? [...session.messages] as PersistedChatMessage[]
        : [];
      messages.push({
        role: 'user',
        content: message,
        timestamp: new Date().toISOString(),
      });

      const { error: updateError } = await db
        .from('ai_sessions')
        .update({
          messages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .eq('portfolio_id', scope.portfolioId)
        .eq('user_id', userId);
      if (updateError) throw updateError;

      return { sessionId, messages };
    },

    async finish(
      sessionId: string,
      messages: PersistedChatMessage[],
      assistantMessage: PersistedChatMessage
    ) {
      const nextMessages = [...messages, assistantMessage];
      const { error } = await db
        .from('ai_sessions')
        .update({
          messages: nextMessages,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .eq('portfolio_id', scope.portfolioId)
        .eq('user_id', userId);
      if (error) throw error;
    },

    async listHistory() {
      const { data: session, error } = await db
        .from('ai_sessions')
        .select('*')
        .eq('portfolio_id', scope.portfolioId)
        .eq('user_id', userId)
        .is('ended_at', null)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return session;
    },

    async loadSavedWidgets(widgetIds: string[]) {
      if (widgetIds.length === 0) return [];

      const [portfolioWidgets, holdingWidgets] = await Promise.all([
        db
          .from('widgets')
          .select('*')
          .eq('portfolio_id', scope.portfolioId)
          .in('id', widgetIds),
        db
          .from('holding_widgets')
          .select('*, holdings!inner(portfolio_id)')
          .eq('holdings.portfolio_id', scope.portfolioId)
          .in('id', widgetIds),
      ]);
      if (portfolioWidgets.error) throw portfolioWidgets.error;
      if (holdingWidgets.error) throw holdingWidgets.error;

      const holdingRows = (holdingWidgets.data || []).map((row) => {
        const { holdings: _scopeProof, ...widget } = row;
        return widget;
      });
      return [...(portfolioWidgets.data || []), ...holdingRows];
    },

    async recordUsage(sessionId: string, usage: UsageRecord) {
      const elevated = createElevatedClient();
      const { error } = await elevated.from('ai_usage_log').insert({
        user_id: userId,
        org_id: scope.orgId,
        portfolio_id: scope.portfolioId,
        session_id: sessionId,
        model: usage.model,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
      });
      if (error) throw error;
    },
  };
}
