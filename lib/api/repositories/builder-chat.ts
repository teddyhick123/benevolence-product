import { createElevatedClient } from '@/lib/api/admin-client';
import type { SessionClient } from '@/lib/api/server-client';
import { fetchOrgSnapshot } from '@/lib/builder/context-bundle';
import { executeTool, type ToolResult } from '@/lib/builder/tools';

export interface BuilderStoredMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

type OrgBuilderChatScope = {
  orgId: string;
  actorId: string;
  sessionDb: SessionClient;
};

/** Builder chat persistence and tool execution bound to one authorized org/user pair. */
export function createOrgBuilderChatRepository(scope: OrgBuilderChatScope) {
  const elevatedDb = createElevatedClient();

  return {
    async recordRequest(requestText: string) {
      const { error } = await elevatedDb.from('builder_events').insert({
        org_id: scope.orgId,
        user_id: scope.actorId,
        event_type: 'ai_request',
        request_text: requestText,
      });
      if (error) throw error;
    },

    async loadContext() {
      const [snapshot, sessionResult] = await Promise.all([
        fetchOrgSnapshot(scope.sessionDb, scope.orgId),
        scope.sessionDb
          .from('builder_sessions')
          .select('id, messages')
          .eq('org_id', scope.orgId)
          .eq('user_id', scope.actorId)
          .maybeSingle(),
      ]);

      return {
        snapshot,
        existingMessages: (sessionResult.data?.messages as BuilderStoredMessage[]) || [],
      };
    },

    async runTool(
      toolName: string,
      toolInput: Record<string, unknown>,
      requestText: string
    ): Promise<ToolResult> {
      return executeTool(
        toolName,
        toolInput,
        scope.orgId,
        scope.actorId,
        requestText,
        scope.sessionDb,
        elevatedDb
      );
    },

    async saveSession(messages: BuilderStoredMessage[]) {
      const { error } = await scope.sessionDb.from('builder_sessions').upsert({
        org_id: scope.orgId,
        user_id: scope.actorId,
        messages,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'org_id,user_id' });
      if (error) throw error;
    },
  };
}
