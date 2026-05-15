// lib/import/ai/chat.ts
// Migration Copilot streaming chat

import { branding } from '@/lib/config';
import { callAIStreaming } from './client';

const CHAT_SYSTEM = `You are the ${branding.appName} Migration Copilot — an expert AI assistant helping clients migrate their philanthropic data from Blackbaud, Salesforce NPSP, or DonorPerfect to ${branding.appName}.

You have access to the current import job context. Use it to give specific, actionable answers.

## Your Capabilities
- Explain why rows failed validation and suggest fixes
- Interpret reconciliation discrepancies
- Guide users through the import process step by step
- Suggest bulk fixes when patterns of errors are detected
- Explain what each import phase does in plain language

## Tone
- Professional but approachable
- Confident but not dismissive of concerns
- Use plain English — avoid database jargon unless necessary
- When suggesting actions, be specific (field names, row counts, exact steps)

## Available Actions (include in suggested_actions array when relevant)
- { "type": "bulk_fix", "description": "...", "entity": "contributions", "field": "recipient_ein", "fix": "normalize_ein" }
- { "type": "export_failed", "description": "Download failed rows as CSV" }
- { "type": "adjust_mapping", "description": "...", "entity": "...", "field": "..." }
- { "type": "skip_warnings", "description": "Mark all warnings as acceptable and proceed" }
- { "type": "rollback", "description": "...", "scope": "full|contributions|holdings" }
- { "type": "commit", "description": "Finalize and commit the import" }
- { "type": "view_errors", "description": "Open error browser filtered to...", "filter": "..." }

## Response Format
Respond conversationally. If you have suggested actions, end with:
[ACTIONS]
{ "suggested_actions": [...] }
[/ACTIONS]

Keep responses concise — under 200 words unless a detailed explanation is needed.`;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatAction {
  type: string;
  description: string;
  [key: string]: unknown;
}

export interface StreamMigrationChatParams {
  importJobId: string;
  message: string;
  history: ChatMessage[];
  jobContext: {
    status: string;
    recordsExtracted: number;
    recordsLoaded: number;
    recordsFailed: number;
    recentErrors: Array<{ field: string; message: string; count: number }>;
    reconciliation?: Record<string, unknown>;
  };
}

export async function streamMigrationChat(
  params: StreamMigrationChatParams,
  onChunk: (text: string) => void
): Promise<{ fullResponse: string; actions: ChatAction[] }> {
  const { importJobId, message, history, jobContext } = params;

  // Build context block
  const contextBlock = `## Current Import Job Context
Job ID: ${importJobId}
Status: ${jobContext.status}
Records Extracted: ${jobContext.recordsExtracted}
Records Loaded: ${jobContext.recordsLoaded}
Records Failed: ${jobContext.recordsFailed}

${
  jobContext.recentErrors.length > 0
    ? `## Top Validation Errors
${jobContext.recentErrors
  .slice(0, 10)
  .map((e) => `- ${e.field}: "${e.message}" (${e.count} rows)`)
  .join('\n')}`
    : '## Validation Errors\nNo validation errors on record.'
}

${
  jobContext.reconciliation
    ? `## Reconciliation Data\n${JSON.stringify(jobContext.reconciliation, null, 2)}`
    : ''
}`;

  // Build conversation history as a single user prompt
  const historyText =
    history.length > 0
      ? history
          .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
          .join('\n\n') + '\n\n'
      : '';

  const userPrompt = `${contextBlock}

---

${historyText}User: ${message}`;

  let fullResponse = '';

  await callAIStreaming(
    CHAT_SYSTEM,
    userPrompt,
    (chunk) => {
      fullResponse += chunk;
      // Strip action blocks from streamed text so UI doesn't show raw JSON
      onChunk(chunk);
    },
    { maxTokens: 1024 }
  );

  // Parse [ACTIONS]...[/ACTIONS] block
  const actions: ChatAction[] = [];
  const actionsMatch = fullResponse.match(/\[ACTIONS\]([\s\S]*?)\[\/ACTIONS\]/);
  if (actionsMatch) {
    try {
      const parsed = JSON.parse(actionsMatch[1].trim()) as {
        suggested_actions?: ChatAction[];
      };
      if (Array.isArray(parsed.suggested_actions)) {
        actions.push(...parsed.suggested_actions);
      }
    } catch {
      // ignore parse errors
    }
    // Remove actions block from full response
    fullResponse = fullResponse.replace(/\[ACTIONS\][\s\S]*?\[\/ACTIONS\]/, '').trim();
  }

  return { fullResponse, actions };
}
