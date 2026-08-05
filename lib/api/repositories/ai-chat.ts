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

export type AiChatResponsePayload = {
  message: string;
  actions: unknown[];
  widgets: unknown[];
  content_blocks?: unknown[];
  sessionId: string;
};

export type AiChatHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type BeginAiTurnResult =
  | {
      state: 'started';
      turnId: string;
      sessionId: string;
      history: AiChatHistoryMessage[];
    }
  | {
      state: 'completed';
      turnId: string;
      sessionId: string;
      response: AiChatResponsePayload;
    }
  | {
      state: 'in_progress' | 'failed';
      turnId: string;
      sessionId: string;
      failureCode?: string;
      failureMessage?: string;
    };

type UsageRecord = {
  model: string;
  inputTokens: number;
  outputTokens: number;
};

type BeginTurnRpcResult = {
  started?: boolean;
  turn_id?: string;
  session_id?: string;
  status?: 'in_progress' | 'completed' | 'failed';
  response?: AiChatResponsePayload | null;
  failure_code?: string | null;
  failure_message?: string | null;
};

type MessageRow = {
  role: 'user' | 'assistant';
  content: unknown;
  widgets: unknown;
  content_blocks: unknown;
  created_at: string;
};

function requireRpcIdentity(result: BeginTurnRpcResult) {
  if (!result.turn_id || !result.session_id || !result.status) {
    throw new Error('AI turn persistence returned an invalid result');
  }
  return {
    turnId: result.turn_id,
    sessionId: result.session_id,
    status: result.status,
  };
}

function toHistory(rows: MessageRow[]): AiChatHistoryMessage[] {
  return rows.flatMap((row) =>
    typeof row.content === 'string'
      ? [{ role: row.role, content: row.content }]
      : [],
  );
}

function toPersistedMessage(row: MessageRow): PersistedChatMessage {
  return {
    role: row.role,
    content: row.content,
    timestamp: row.created_at,
    ...(Array.isArray(row.widgets) ? { widgets: row.widgets } : {}),
    ...(Array.isArray(row.content_blocks)
      ? { content_blocks: row.content_blocks }
      : {}),
  };
}

/** Durable chat persistence scoped to one authenticated user and portfolio. */
export function createAiChatRepository(scope: AiChatScope) {
  const db = scope.db;
  const userId = scope.principal.userId;

  return {
    async beginTurn(
      requestId: string,
      message: string,
    ): Promise<BeginAiTurnResult> {
      const { data, error } = await db.rpc('begin_ai_turn', {
        p_portfolio_id: scope.portfolioId,
        p_user_id: userId,
        p_request_id: requestId,
        p_content: message,
      });
      if (error) throw error;

      const result = (data ?? {}) as BeginTurnRpcResult;
      const identity = requireRpcIdentity(result);

      if (!result.started) {
        if (identity.status === 'completed') {
          if (!result.response) {
            throw new Error(
              'Completed AI turn is missing its persisted response',
            );
          }
          return { state: 'completed', ...identity, response: result.response };
        }
        return {
          state: identity.status,
          ...identity,
          ...(result.failure_code ? { failureCode: result.failure_code } : {}),
          ...(result.failure_message
            ? { failureMessage: result.failure_message }
            : {}),
        };
      }

      const { data: rows, error: historyError } = await db
        .from('ai_messages')
        .select('role, content, widgets, content_blocks, created_at')
        .eq('session_id', identity.sessionId)
        .eq('portfolio_id', scope.portfolioId)
        .eq('user_id', userId)
        .neq('turn_id', identity.turnId)
        .order('sequence_no', { ascending: true });
      if (historyError) throw historyError;

      return {
        state: 'started',
        ...identity,
        history: toHistory((rows ?? []) as MessageRow[]),
      };
    },

    async completeTurn(
      turnId: string,
      assistantMessage: PersistedChatMessage,
      response: AiChatResponsePayload,
    ): Promise<AiChatResponsePayload> {
      const { data, error } = await db.rpc('complete_ai_turn', {
        p_turn_id: turnId,
        p_portfolio_id: scope.portfolioId,
        p_user_id: userId,
        p_content: assistantMessage.content,
        p_widgets: assistantMessage.widgets ?? null,
        p_content_blocks: assistantMessage.content_blocks ?? null,
        p_response: response,
      });
      if (error) throw error;
      return data as AiChatResponsePayload;
    },

    async failTurn(
      turnId: string,
      failureCode: string,
      failureMessage: string,
    ) {
      const { error } = await db.rpc('fail_ai_turn', {
        p_turn_id: turnId,
        p_portfolio_id: scope.portfolioId,
        p_user_id: userId,
        p_failure_code: failureCode,
        p_failure_message: failureMessage,
      });
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
      if (!session)
        return { session: null, messages: [] as PersistedChatMessage[] };

      const { data: rows, error: messagesError } = await db
        .from('ai_messages')
        .select('role, content, widgets, content_blocks, created_at')
        .eq('session_id', session.id)
        .eq('portfolio_id', scope.portfolioId)
        .eq('user_id', userId)
        .order('sequence_no', { ascending: true });
      if (messagesError) throw messagesError;

      return {
        session,
        messages: ((rows ?? []) as MessageRow[]).map(toPersistedMessage),
      };
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
      const { data: session, error: sessionError } = await db
        .from('ai_sessions')
        .select('id')
        .eq('id', sessionId)
        .eq('portfolio_id', scope.portfolioId)
        .eq('user_id', userId)
        .maybeSingle();
      if (sessionError) throw sessionError;
      if (!session) throw new Error('AI session not found');

      const elevated = createElevatedClient();
      const { error } = await elevated.from('ai_usage_log').insert({
        user_id: userId,
        org_id: scope.orgId,
        portfolio_id: scope.portfolioId,
        session_id: session.id,
        model: usage.model,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
      });
      if (error) throw error;
    },
  };
}
