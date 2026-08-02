import { AIActionExecutor } from '@/lib/ai-action-executor';
import type { SessionClient } from '@/lib/api/server-client';

type ActionReference =
  | { actionId: string; batchId?: never }
  | { actionId?: never; batchId: string };

type ActionScope = {
  portfolioId: string;
  actionId?: string;
  batchId?: string;
};

export type ResolvedAiActionMutation =
  | {
      ok: true;
      portfolioId: string;
      repository: AiActionMutationRepository;
    }
  | { ok: false; status: 403 | 404 | 500; error: string };

export type AiActionMutationRepository = ReturnType<typeof createMutationRepository>;

function createMutationRepository(db: SessionClient, scope: ActionScope) {
  const executor = new AIActionExecutor(
    db as unknown as ConstructorParameters<typeof AIActionExecutor>[0]
  );

  async function requireAction(actionId: string) {
    const { data, error } = await db
      .from('ai_actions')
      .select('id')
      .eq('id', actionId)
      .eq('portfolio_id', scope.portfolioId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Action not found');
  }

  async function requireBatch(batchId: string) {
    const { data, error } = await db
      .from('ai_actions')
      .select('id, portfolio_id')
      .eq('batch_id', batchId);
    if (error) throw error;
    if (!data?.length || data.some((action) => action.portfolio_id !== scope.portfolioId)) {
      throw new Error('Batch not found');
    }
  }

  return {
    async undo() {
      if (scope.batchId) {
        await requireBatch(scope.batchId);
        return executor.undoBatch(scope.batchId);
      }
      if (!scope.actionId) throw new Error('Action not found');
      await requireAction(scope.actionId);
      return executor.undoAction(scope.actionId);
    },

    async redo() {
      if (!scope.actionId) throw new Error('Action not found');
      await requireAction(scope.actionId);
      return executor.redoAction(scope.actionId);
    },
  };
}

/** Resolve an action through user RLS and prove edit access before replaying it. */
export async function resolveAiActionMutation(
  db: SessionClient,
  reference: ActionReference
): Promise<ResolvedAiActionMutation> {
  let portfolioId: string | null = null;

  if (reference.actionId) {
    const { data, error } = await db
      .from('ai_actions')
      .select('portfolio_id')
      .eq('id', reference.actionId)
      .maybeSingle();
    if (error) return { ok: false, status: 500, error: error.message };
    portfolioId = data?.portfolio_id ?? null;
  } else {
    const { data, error } = await db
      .from('ai_actions')
      .select('portfolio_id')
      .eq('batch_id', reference.batchId);
    if (error) return { ok: false, status: 500, error: error.message };
    const portfolioIds = new Set((data || []).map((action) => action.portfolio_id));
    if (portfolioIds.size === 1) portfolioId = [...portfolioIds][0];
  }

  if (!portfolioId) return { ok: false, status: 404, error: 'Action not found' };

  const { data: canEdit, error: accessError } = await db.rpc('can_edit_portfolio', {
    p_portfolio_id: portfolioId,
  });
  if (accessError) return { ok: false, status: 500, error: accessError.message };
  if (!canEdit) return { ok: false, status: 403, error: 'Access denied' };

  const scope: ActionScope = {
    portfolioId,
    actionId: reference.actionId,
    batchId: reference.batchId,
  };
  return {
    ok: true,
    portfolioId,
    repository: createMutationRepository(db, scope),
  };
}

export function createAiActionHistoryRepository(db: SessionClient, portfolioId: string) {
  return {
    async list(limit: number) {
      const { data, error } = await db
        .from('ai_actions')
        .select('*')
        .eq('portfolio_id', portfolioId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data || [];
    },
  };
}
