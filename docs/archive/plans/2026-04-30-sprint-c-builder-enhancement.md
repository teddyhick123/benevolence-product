# Builder Enhancement — Sprint C Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Builder tab with per-org AI instructions injection, KPI CRUD tools, and a three-phase professional-grade module scaffold (plan → async BullMQ build → review → apply).

**Architecture:** An AI provider abstraction layer (`lib/ai/`) decouples all Claude calls from the Anthropic SDK so any provider can be swapped via env var. The three-phase scaffold runs planning synchronously in the Builder tool executor, dispatches a BullMQ worker for the multi-file build phase, and chains a review call automatically on completion. Phase state is tracked in `builder_proposals.phase`; the BuilderChat UI renders phase-aware cards (PlanCard, BuildProgressCard, ReviewReportCard).

**Tech Stack:** Next.js 15 App Router, TypeScript, Supabase (PostgreSQL + RLS), `@anthropic-ai/sdk`, BullMQ + Redis, React 18, Tailwind CSS, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `db/migrations/0026_builder_enhancement.sql` | Create | DB columns: `organizations.ai_instructions`, `builder_proposals.phase/plan_content/review_report` |
| `lib/ai/types.ts` | Create | Shared provider-agnostic AI types |
| `lib/ai/provider.ts` | Create | `AIProvider` interface |
| `lib/ai/models.ts` | Create | Per-phase model config constants |
| `lib/ai/providers/anthropic.ts` | Create | `AnthropicProvider` implements `AIProvider` |
| `lib/ai/factory.ts` | Create | `createAIProvider()` factory |
| `lib/claude-assistant.ts` | Modify | Swap Anthropic SDK → AIProvider; inject `ai_instructions` in system prompt |
| `app/api/org/[orgId]/builder/chat/route.ts` | Modify | Swap Anthropic SDK → AIProvider; handle `scaffold_plan` SSE event |
| `lib/builder/tools.ts` | Modify | Add 5 tools + extend `update_org_branding` |
| `lib/builder/context-bundle.ts` | Modify | Add `ai_instructions` to `OrgSnapshot`; fetch from DB |
| `lib/builder/scaffold-context.ts` | Create | Builds rich context bundle for scaffold phases |
| `lib/builder/scaffold-worker.ts` | Create | BullMQ worker for Phase 2 (build) and Phase 3 (review) |
| `app/api/org/[orgId]/builder/proposals/[proposalId]/route.ts` | Create | GET endpoint for proposal polling |
| `app/api/org/[orgId]/builder/proposals/[proposalId]/build/route.ts` | Create | POST: dispatch scaffold-build BullMQ job |
| `app/api/admin/builder/proposals/[proposalId]/apply/route.ts` | Create | POST: write generated files to disk |
| `components/settings/builder/PlanCard.tsx` | Create | Phase 1 review card |
| `components/settings/builder/BuildProgressCard.tsx` | Create | Phase 2 progress card (polls proposal) |
| `components/settings/builder/ReviewReportCard.tsx` | Create | Phase 3 review report card |
| `components/settings/BuilderChat.tsx` | Modify | Render 3 new card types |

---

## Task 1: DB Migration

**Files:**
- Create: `db/migrations/0026_builder_enhancement.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- db/migrations/0026_builder_enhancement.sql
-- Builder Enhancement Sprint C
-- Adds: organizations.ai_instructions, builder_proposals phase columns

-- 1. Per-org AI assistant instructions
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS ai_instructions TEXT;

-- 2. Scaffold phase state machine
ALTER TABLE public.builder_proposals
  ADD COLUMN IF NOT EXISTS phase TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS plan_content JSONB,
  ADD COLUMN IF NOT EXISTS review_report JSONB;

-- Valid phases: pending | planning | plan_ready | building | build_ready
--               reviewing | ready_to_apply | applied
-- Existing proposals keep phase='pending'; new scaffold proposals use the full machine.

CREATE INDEX IF NOT EXISTS builder_proposals_phase_idx
  ON public.builder_proposals (phase, created_at DESC);
```

- [ ] **Step 2: Verify SQL parses without error**

Run: `npx supabase db lint` (or open the file in a SQL editor and check for syntax errors — the migration is additive so no data risk).

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0026_builder_enhancement.sql
git commit -m "feat: migration 0026 — ai_instructions + builder_proposals phase columns"
```

---

## Task 2: AI Types, Provider Interface, and Models Config

**Files:**
- Create: `lib/ai/types.ts`
- Create: `lib/ai/provider.ts`
- Create: `lib/ai/models.ts`
- Test: `lib/ai/__tests__/models.test.ts`

- [ ] **Step 1: Write failing test for models config**

```typescript
// lib/ai/__tests__/models.test.ts
import { describe, it, expect } from 'vitest';

describe('AI_MODELS', () => {
  it('exports assistant model with a default', async () => {
    const { AI_MODELS } = await import('../models');
    expect(typeof AI_MODELS.assistant).toBe('string');
    expect(AI_MODELS.assistant.length).toBeGreaterThan(0);
  });

  it('exports separate models for each scaffold phase', async () => {
    const { AI_MODELS } = await import('../models');
    expect(AI_MODELS.scaffoldPlan).toBeDefined();
    expect(AI_MODELS.scaffoldBuild).toBeDefined();
    expect(AI_MODELS.scaffoldReview).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/ai/__tests__/models.test.ts`
Expected: FAIL — "Cannot find module '../models'"

- [ ] **Step 3: Create `lib/ai/types.ts`**

```typescript
// lib/ai/types.ts

export interface AIMessage {
  role: 'user' | 'assistant';
  content: string | AIContentBlock[];
}

export type AIContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface AIResponse {
  content: AIContentBlock[];
  stopReason: string | null;
  model: string;
}

export type AIStreamChunk =
  | { type: 'content_block_start'; blockType: 'text' | 'tool_use'; id?: string; name?: string }
  | { type: 'text_delta'; text: string }
  | { type: 'tool_input_delta'; partialJson: string }
  | { type: 'content_block_stop' }
  | { type: 'message_stop'; stopReason: string | null };
```

- [ ] **Step 4: Create `lib/ai/provider.ts`**

```typescript
// lib/ai/provider.ts
import type { AIMessage, AIResponse, AIStreamChunk, ToolDefinition } from './types';

export interface AIRequestConfig {
  model: string;
  system?: string;
  messages: AIMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
}

export interface AIProvider {
  createMessage(config: AIRequestConfig): Promise<AIResponse>;
  createStream(config: AIRequestConfig): AsyncIterable<AIStreamChunk>;
}
```

- [ ] **Step 5: Create `lib/ai/models.ts`**

```typescript
// lib/ai/models.ts
export const AI_MODELS = {
  assistant:      process.env.AI_MODEL_ASSISTANT       ?? 'claude-sonnet-4-6',
  scaffoldPlan:   process.env.AI_MODEL_SCAFFOLD_PLAN   ?? 'claude-opus-4-7',
  scaffoldBuild:  process.env.AI_MODEL_SCAFFOLD_BUILD  ?? 'claude-sonnet-4-6',
  scaffoldReview: process.env.AI_MODEL_SCAFFOLD_REVIEW ?? 'claude-opus-4-7',
} as const;
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run lib/ai/__tests__/models.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/ai/types.ts lib/ai/provider.ts lib/ai/models.ts lib/ai/__tests__/models.test.ts
git commit -m "feat: AI provider abstraction — types, interface, models config"
```

---

## Task 3: AnthropicProvider and Factory

**Files:**
- Create: `lib/ai/providers/anthropic.ts`
- Create: `lib/ai/factory.ts`
- Test: `lib/ai/__tests__/factory.test.ts`

- [ ] **Step 1: Write failing factory test**

```typescript
// lib/ai/__tests__/factory.test.ts
import { describe, it, expect } from 'vitest';

describe('createAIProvider', () => {
  it('returns a provider with createMessage and createStream', async () => {
    const { createAIProvider } = await import('../factory');
    const provider = createAIProvider('anthropic');
    expect(typeof provider.createMessage).toBe('function');
    expect(typeof provider.createStream).toBe('function');
  });

  it('throws for unknown provider', async () => {
    const { createAIProvider } = await import('../factory');
    expect(() => createAIProvider('openai')).toThrow('Unknown AI provider: openai');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/ai/__tests__/factory.test.ts`
Expected: FAIL — "Cannot find module '../factory'"

- [ ] **Step 3: Create `lib/ai/providers/anthropic.ts`**

```typescript
// lib/ai/providers/anthropic.ts
import Anthropic from '@anthropic-ai/sdk';
import type { AIProvider, AIRequestConfig } from '../provider';
import type { AIResponse, AIStreamChunk, AIContentBlock } from '../types';

export class AnthropicProvider implements AIProvider {
  private client: Anthropic;

  constructor(apiKey?: string) {
    this.client = new Anthropic({ apiKey: apiKey ?? process.env.ANTHROPIC_API_KEY });
  }

  async createMessage(config: AIRequestConfig): Promise<AIResponse> {
    const response = await this.client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens ?? 4096,
      system: config.system,
      messages: config.messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string'
          ? m.content
          : (m.content as AIContentBlock[]).map(block => {
              if (block.type === 'text') return { type: 'text' as const, text: block.text };
              if (block.type === 'tool_use') return { type: 'tool_use' as const, id: block.id, name: block.name, input: block.input };
              // tool_result
              return { type: 'tool_result' as const, tool_use_id: block.tool_use_id, content: block.content };
            }),
      })),
      tools: config.tools as unknown as Anthropic.Tool[],
    });

    const content: AIContentBlock[] = response.content.map(block => {
      if (block.type === 'text') return { type: 'text', text: block.text };
      if (block.type === 'tool_use') return { type: 'tool_use', id: block.id, name: block.name, input: block.input as Record<string, unknown> };
      return { type: 'text', text: '' };
    });

    return { content, stopReason: response.stop_reason ?? null, model: response.model };
  }

  async *createStream(config: AIRequestConfig): AsyncIterable<AIStreamChunk> {
    const stream = await this.client.messages.create({
      model: config.model,
      max_tokens: config.maxTokens ?? 4096,
      system: config.system,
      messages: config.messages.map(m => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : m.content as any,
      })),
      tools: config.tools as unknown as Anthropic.Tool[],
      stream: true,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        if (event.content_block.type === 'tool_use') {
          yield { type: 'content_block_start', blockType: 'tool_use', id: event.content_block.id, name: event.content_block.name };
        } else if (event.content_block.type === 'text') {
          yield { type: 'content_block_start', blockType: 'text' };
        }
      } else if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text_delta', text: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          yield { type: 'tool_input_delta', partialJson: event.delta.partial_json };
        }
      } else if (event.type === 'content_block_stop') {
        yield { type: 'content_block_stop' };
      } else if (event.type === 'message_delta') {
        yield { type: 'message_stop', stopReason: event.delta.stop_reason ?? null };
      }
    }
  }
}
```

- [ ] **Step 4: Create `lib/ai/factory.ts`**

```typescript
// lib/ai/factory.ts
import { AnthropicProvider } from './providers/anthropic';
import type { AIProvider } from './provider';

export function createAIProvider(provider?: string): AIProvider {
  const p = provider ?? process.env.AI_PROVIDER ?? 'anthropic';
  switch (p) {
    case 'anthropic':
      return new AnthropicProvider();
    default:
      throw new Error(`Unknown AI provider: ${p}. Supported: anthropic`);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run lib/ai/__tests__/factory.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/ai/providers/anthropic.ts lib/ai/factory.ts lib/ai/__tests__/factory.test.ts
git commit -m "feat: AnthropicProvider implementation and createAIProvider factory"
```

---

## Task 4: Migrate `lib/claude-assistant.ts` to AIProvider + Inject `ai_instructions`

**Files:**
- Modify: `lib/claude-assistant.ts`
- Test: `lib/ai/__tests__/ai-instructions-injection.test.ts`

**Background:** `lib/claude-assistant.ts` currently declares `private anthropic: Anthropic` (line ~1278) and calls `this.anthropic.messages.create(...)` twice (lines ~1357–1358 and ~1422–1423). The `initializeForOrg` method (line ~1296) fetches enabled modules from the DB. We'll extend it to also fetch `ai_instructions` and inject it into the system prompt.

- [ ] **Step 1: Write failing test**

```typescript
// lib/ai/__tests__/ai-instructions-injection.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('lib/claude-assistant.ts ai_instructions injection', () => {
  const src = readFileSync('lib/claude-assistant.ts', 'utf8');

  it('imports createAIProvider from lib/ai/factory', () => {
    expect(src).toMatch(/from ['"]@\/lib\/ai\/factory['"]/);
  });

  it('imports AI_MODELS from lib/ai/models', () => {
    expect(src).toMatch(/from ['"]@\/lib\/ai\/models['"]/);
  });

  it('no longer directly instantiates Anthropic client in constructor', () => {
    // After migration, constructor should not call new Anthropic(
    expect(src).not.toMatch(/this\.anthropic\s*=\s*new Anthropic/);
  });

  it('uses AI_MODELS.assistant for the model string', () => {
    expect(src).toMatch(/AI_MODELS\.assistant/);
  });

  it('fetches ai_instructions in initializeForOrg', () => {
    expect(src).toMatch(/ai_instructions/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/ai/__tests__/ai-instructions-injection.test.ts`
Expected: FAIL — assertions about imports and patterns not yet present

- [ ] **Step 3: Update imports at the top of `lib/claude-assistant.ts`**

At the top of `lib/claude-assistant.ts` (after the existing `import Anthropic from '@anthropic-ai/sdk'`), add:

```typescript
import { createAIProvider } from '@/lib/ai/factory';
import { AI_MODELS } from '@/lib/ai/models';
import type { AIProvider } from '@/lib/ai/provider';
import type { AIContentBlock, ToolDefinition } from '@/lib/ai/types';
```

Keep the `import Anthropic from '@anthropic-ai/sdk'` line — it's still needed for the `Anthropic.Tool[]` type used in `PORTFOLIO_TOOLS` and `filterToolsForOrg`.

- [ ] **Step 4: Update `ClaudePortfolioAssistant` class fields**

Find the class declaration and replace `private anthropic: Anthropic;` with:

```typescript
private provider: AIProvider;
private aiInstructions: string | null = null;
```

- [ ] **Step 5: Update the constructor**

Find the constructor body (around line 1283) and replace the Anthropic instantiation:

```typescript
// BEFORE:
this.anthropic = new Anthropic({ apiKey: anthropicApiKey });

// AFTER:
this.provider = createAIProvider();
```

The `anthropicApiKey` constructor parameter can remain (it may be called from existing code) — just don't use it to create a client anymore. The factory reads `ANTHROPIC_API_KEY` env var.

- [ ] **Step 6: Update `initializeForOrg` to also fetch `ai_instructions`**

Find `initializeForOrg` (line ~1296) and replace its body:

```typescript
async initializeForOrg(orgId: string): Promise<void> {
  const [enabledModules, orgRes] = await Promise.all([
    getOrgEnabledModules(this.supabase, orgId),
    this.supabase
      .from('organizations')
      .select('ai_instructions')
      .eq('id', orgId)
      .single(),
  ]);
  this.enabledModules = enabledModules;
  this.moduleSystemPrompt = getSystemPromptForModules(this.enabledModules);
  this.aiInstructions = orgRes.data?.ai_instructions ?? null;
}
```

- [ ] **Step 7: Update `buildSystemPrompt` to inject `ai_instructions`**

Find `buildSystemPrompt` (line ~5768). At the end of the method, before the `return` statement, add the `ai_instructions` block. The return statement currently returns a long string. Append to that string:

```typescript
// At the end of the string being built, before the final return:
if (this.aiInstructions) {
  prompt += `\n\n## Org-Specific Instructions\n${this.aiInstructions}\n`;
}
```

If `buildSystemPrompt` builds via template literals, add:
```typescript
${this.aiInstructions ? `\n\n## Org-Specific Instructions\n${this.aiInstructions}\n` : ''}
```

- [ ] **Step 8: Replace first `this.anthropic.messages.create` call (line ~1357–1360)**

```typescript
// BEFORE:
const response = await this.anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 4096,
  system: systemPrompt,
  tools,
  messages: claudeMessages,
});

// AFTER:
const aiResponse = await this.provider.createMessage({
  model: AI_MODELS.assistant,
  maxTokens: 4096,
  system: systemPrompt,
  tools: tools as unknown as ToolDefinition[],
  messages: claudeMessages,
});
const response = aiResponse; // response.content is AIContentBlock[]
```

- [ ] **Step 9: Update code that reads `response.content` after the first call**

The two filter lines around line 1372 and 1375 use `Anthropic.ToolUseBlock` and `Anthropic.TextBlock`. Update them:

```typescript
// BEFORE:
const toolUseBlocks = response.content.filter(
  (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
);
const textBlocks = response.content.filter(
  (block): block is Anthropic.TextBlock => block.type === 'text'
);

// AFTER:
const toolUseBlocks = response.content.filter(
  (block): block is AIContentBlock & { type: 'tool_use' } => block.type === 'tool_use'
);
const textBlocks = response.content.filter(
  (block): block is AIContentBlock & { type: 'text' } => block.type === 'text'
);
```

Inside the tool execution loop, `toolUse.id`, `toolUse.name`, `toolUse.input` are all present on the `AIContentBlock` tool_use type — no change needed there.

- [ ] **Step 10: Replace second `this.anthropic.messages.create` call (line ~1422–1435)**

Find the final response call and replace:

```typescript
// BEFORE:
const finalResponse = await this.anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 4096,
  system: systemPrompt,
  tools,
  messages: [
    ...claudeMessages,
    { role: 'assistant', content: response.content },
    {
      role: 'user',
      content: toolResults.map(tr => ({
        type: 'tool_result' as const,
        tool_use_id: tr.tool_use_id,
        content: tr.content,
      })),
    },
  ],
});

// AFTER:
const finalAiResponse = await this.provider.createMessage({
  model: AI_MODELS.assistant,
  maxTokens: 4096,
  system: systemPrompt,
  tools: tools as unknown as ToolDefinition[],
  messages: [
    ...claudeMessages,
    { role: 'assistant' as const, content: response.content },
    {
      role: 'user' as const,
      content: toolResults.map(tr => ({
        type: 'tool_result' as const,
        tool_use_id: tr.tool_use_id,
        content: tr.content,
      })) as AIContentBlock[],
    },
  ],
});
const finalResponse = finalAiResponse;
```

- [ ] **Step 11: Update code that reads `finalResponse.content`**

Find around line 1443:
```typescript
// BEFORE:
const finalTextBlocks = finalResponse.content.filter(
  (block): block is Anthropic.TextBlock => block.type === 'text'
);

// AFTER:
const finalTextBlocks = finalResponse.content.filter(
  (block): block is AIContentBlock & { type: 'text' } => block.type === 'text'
);
```

- [ ] **Step 12: Run the test to verify it passes**

Run: `npx vitest run lib/ai/__tests__/ai-instructions-injection.test.ts`
Expected: PASS

- [ ] **Step 13: Run full test suite to check for regressions**

Run: `npx vitest run`
Expected: all tests pass (or same count as before this task)

- [ ] **Step 14: Commit**

```bash
git add lib/claude-assistant.ts lib/ai/__tests__/ai-instructions-injection.test.ts
git commit -m "feat: migrate ClaudePortfolioAssistant to AIProvider + inject ai_instructions"
```

---

## Task 5: Migrate Builder Chat Route to AIProvider

**Files:**
- Modify: `app/api/org/[orgId]/builder/chat/route.ts`

**Background:** This route currently calls `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })` (line ~75) and uses a streaming loop with raw Anthropic SDK event types. We swap to `createAIProvider()` and `createStream()` with normalized `AIStreamChunk` types.

- [ ] **Step 1: Update imports in `app/api/org/[orgId]/builder/chat/route.ts`**

Add after the existing imports:
```typescript
import { createAIProvider } from '@/lib/ai/factory';
import { AI_MODELS } from '@/lib/ai/models';
import type { AIStreamChunk, AIContentBlock } from '@/lib/ai/types';
```

Remove: `import Anthropic from '@anthropic-ai/sdk';`

- [ ] **Step 2: Replace `new Anthropic(...)` with `createAIProvider()`**

Find (around line 75):
```typescript
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
```

Replace with:
```typescript
const provider = createAIProvider();
```

- [ ] **Step 3: Replace `anthropic.messages.create(...)` with `provider.createStream(...)`**

Find the inner `while (true)` loop. Replace the streaming call and event loop:

```typescript
// BEFORE:
const response = await anthropic.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 4096,
  system: systemPrompt,
  tools: BUILDER_TOOLS,
  messages: currentMessages,
  stream: true,
});

let stopReason: string | null = null;
const toolUseBlocks: Anthropic.ToolUseBlock[] = [];
const assistantContentBlocks: Array<{ type: 'text'; text: string } | Anthropic.ToolUseBlock> = [];
let currentToolInput = '';
let currentToolId = '';
let currentToolName = '';
let currentBlockType: 'text' | 'tool_use' | null = null;
let currentBlockText = '';

for await (const event of response) {
  if (event.type === 'content_block_start') {
    if (event.content_block.type === 'tool_use') {
      currentBlockType = 'tool_use';
      currentToolId = event.content_block.id;
      currentToolName = event.content_block.name;
      currentToolInput = '';
      send({ type: 'tool_start', tool: currentToolName });
    } else if (event.content_block.type === 'text') {
      currentBlockType = 'text';
      currentBlockText = '';
    }
  } else if (event.type === 'content_block_delta') {
    if (event.delta.type === 'text_delta') {
      fullAssistantText += event.delta.text;
      currentBlockText += event.delta.text;
      send({ type: 'text', text: event.delta.text });
    } else if (event.delta.type === 'input_json_delta') {
      currentToolInput += event.delta.partial_json;
    }
  } else if (event.type === 'content_block_stop') {
    if (currentBlockType === 'tool_use' && currentToolName) {
      let parsedInput: Record<string, unknown> = {};
      try { parsedInput = JSON.parse(currentToolInput); } catch { /* ignore */ }
      const toolBlock: Anthropic.ToolUseBlock = {
        type: 'tool_use',
        id: currentToolId,
        name: currentToolName,
        input: parsedInput,
      };
      toolUseBlocks.push(toolBlock);
      assistantContentBlocks.push(toolBlock);
      currentToolName = '';
    } else if (currentBlockType === 'text') {
      assistantContentBlocks.push({ type: 'text', text: currentBlockText });
    }
    currentBlockType = null;
  } else if (event.type === 'message_delta') {
    stopReason = event.delta.stop_reason ?? null;
  }
}

// AFTER:
const stream = provider.createStream({
  model: AI_MODELS.assistant,
  maxTokens: 4096,
  system: systemPrompt,
  tools: BUILDER_TOOLS as any,
  messages: currentMessages,
});

let stopReason: string | null = null;
const toolUseBlocks: AIContentBlock[] = [];
const assistantContentBlocks: AIContentBlock[] = [];
let currentToolInput = '';
let currentToolId = '';
let currentToolName = '';
let currentBlockType: 'text' | 'tool_use' | null = null;
let currentBlockText = '';

for await (const chunk of stream) {
  if (chunk.type === 'content_block_start') {
    if (chunk.blockType === 'tool_use') {
      currentBlockType = 'tool_use';
      currentToolId = chunk.id ?? '';
      currentToolName = chunk.name ?? '';
      currentToolInput = '';
      send({ type: 'tool_start', tool: currentToolName });
    } else {
      currentBlockType = 'text';
      currentBlockText = '';
    }
  } else if (chunk.type === 'text_delta') {
    fullAssistantText += chunk.text;
    currentBlockText += chunk.text;
    send({ type: 'text', text: chunk.text });
  } else if (chunk.type === 'tool_input_delta') {
    currentToolInput += chunk.partialJson;
  } else if (chunk.type === 'content_block_stop') {
    if (currentBlockType === 'tool_use' && currentToolName) {
      let parsedInput: Record<string, unknown> = {};
      try { parsedInput = JSON.parse(currentToolInput); } catch { /* ignore */ }
      const toolBlock: AIContentBlock = {
        type: 'tool_use',
        id: currentToolId,
        name: currentToolName,
        input: parsedInput,
      };
      toolUseBlocks.push(toolBlock);
      assistantContentBlocks.push(toolBlock);
      currentToolName = '';
    } else if (currentBlockType === 'text') {
      assistantContentBlocks.push({ type: 'text', text: currentBlockText });
    }
    currentBlockType = null;
  } else if (chunk.type === 'message_stop') {
    stopReason = chunk.stopReason;
  }
}
```

- [ ] **Step 4: Update `stopReason` check and tool results block**

The code after the stream loop checks `if (stopReason !== 'tool_use' || toolUseBlocks.length === 0)`. That logic is unchanged.

The tool results `Anthropic.ToolResultBlockParam[]` type → update to use plain objects:

```typescript
// BEFORE type annotation:
const toolResults: Anthropic.ToolResultBlockParam[] = [];

// AFTER:
const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];
```

The loop body iterating `toolUseBlocks` uses `toolBlock.name` and `toolBlock.input` — these exist on `AIContentBlock` with type `'tool_use'`. Add a type guard:

```typescript
for (const toolBlock of toolUseBlocks) {
  if (toolBlock.type !== 'tool_use') continue; // type guard
  const result: ToolResult = await executeTool(
    toolBlock.name,       // exists on tool_use block
    toolBlock.input as Record<string, unknown>,
    orgId,
    user.id,
    userMessage,
    supabase,
    adminSupabase
  );
  // ... rest of loop unchanged
  toolResults.push({
    type: 'tool_result',
    tool_use_id: toolBlock.id,
    content: JSON.stringify(result),
  });
}
```

- [ ] **Step 5: Update `currentMessages` after tool loop**

The message push uses `content: assistantContentBlocks` — update its type:

```typescript
currentMessages = [
  ...currentMessages,
  {
    role: 'assistant' as const,
    content: assistantContentBlocks,
  },
  {
    role: 'user' as const,
    content: toolResults as AIContentBlock[],
  },
];
```

- [ ] **Step 6: Add `scaffold_plan` SSE event handling**

In the tool results loop, add a new branch for the scaffold_plan result type (which Task 8 will introduce). Add after the existing `proposal` branch:

```typescript
} else if (result.type === 'scaffold_plan_ready') {
  send({
    type: 'scaffold_plan',
    proposalId: result.proposalId,
    planContent: result.planContent,
  });
}
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no new errors in `app/api/org/[orgId]/builder/chat/route.ts`

- [ ] **Step 8: Commit**

```bash
git add app/api/org/\[orgId\]/builder/chat/route.ts
git commit -m "feat: migrate builder chat route to AIProvider"
```

---

## Task 6: New Builder Tools — set_ai_instructions, KPI CRUD, org name extension

**Files:**
- Modify: `lib/builder/tools.ts`
- Modify: `lib/builder/context-bundle.ts`
- Test: `lib/builder/__tests__/builder-tools-kpi.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/builder/__tests__/builder-tools-kpi.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('builder tools', () => {
  const src = readFileSync('lib/builder/tools.ts', 'utf8');

  it('exports set_ai_instructions tool definition', () => {
    expect(src).toMatch(/name:\s*['"]set_ai_instructions['"]/);
  });

  it('exports list_kpi_definitions tool definition', () => {
    expect(src).toMatch(/name:\s*['"]list_kpi_definitions['"]/);
  });

  it('exports update_metric_definition tool definition', () => {
    expect(src).toMatch(/name:\s*['"]update_metric_definition['"]/);
  });

  it('exports delete_metric_definition tool definition', () => {
    expect(src).toMatch(/name:\s*['"]delete_metric_definition['"]/);
  });

  it('update_org_branding accepts a name field', () => {
    const brandings = src.match(/name:\s*['"]update_org_branding['"]/);
    expect(brandings).not.toBeNull();
    // After that tool definition, 'name' should appear as a property
    const idx = src.indexOf("'update_org_branding'");
    const snippet = src.slice(idx, idx + 600);
    expect(snippet).toMatch(/['"]name['"]/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/builder/__tests__/builder-tools-kpi.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `lib/builder/tools.ts` — extend `update_org_branding`**

In the `update_org_branding` tool definition, add a `name` property to `input_schema.properties`:

```typescript
// In update_org_branding input_schema.properties, add:
name: { type: 'string', description: 'New organization display name' },
```

In the `update_org_branding` case in `executeTool`, add name handling:

```typescript
case 'update_org_branding': {
  const patch: Record<string, string> = {};
  if (toolInput.logo_url !== undefined) patch.logo_url = toolInput.logo_url as string;
  if (toolInput.primary_color !== undefined) patch.primary_color = toolInput.primary_color as string;

  const orgPatch: Record<string, unknown> = {};
  if (toolInput.name !== undefined) orgPatch.name = toolInput.name as string;

  if (Object.keys(patch).length === 0 && Object.keys(orgPatch).length === 0) {
    return { type: 'error', tool: toolName, message: 'No fields provided. Pass logo_url, primary_color, or name.' };
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('branding')
    .eq('id', orgId)
    .single();

  const merged = { ...(org?.branding ?? {}), ...patch };
  orgPatch.branding = merged;

  const { error } = await supabase
    .from('organizations')
    .update(orgPatch)
    .eq('id', orgId);

  if (error) return { type: 'error', tool: toolName, message: error.message };

  const parts: string[] = [];
  if (toolInput.name) parts.push(`name set to "${toolInput.name}"`);
  if (patch.logo_url) parts.push('logo updated');
  if (patch.primary_color) parts.push(`color set to ${patch.primary_color}`);
  return { type: 'config_success', tool: toolName, message: `Updated: ${parts.join(', ')}.` };
}
```

- [ ] **Step 4: Add `set_ai_instructions` tool definition to `BUILDER_TOOLS` array**

```typescript
{
  name: 'set_ai_instructions',
  description: 'Set custom instructions for the AI assistant used by this organization. These instructions are injected into every main assistant chat session for this org — use them to set tone, persona, domain focus, or vocabulary preferences.',
  input_schema: {
    type: 'object' as const,
    properties: {
      instructions: {
        type: 'string',
        description: 'The custom instructions text. Pass an empty string to clear instructions.',
      },
    },
    required: ['instructions'],
  },
},
```

- [ ] **Step 5: Add `set_ai_instructions` executor case**

```typescript
case 'set_ai_instructions': {
  const instructions = toolInput.instructions as string;
  const { error } = await supabase
    .from('organizations')
    .update({ ai_instructions: instructions || null })
    .eq('id', orgId);

  if (error) return { type: 'error', tool: toolName, message: error.message };

  return {
    type: 'config_success',
    tool: toolName,
    message: instructions
      ? 'AI instructions saved. They will be applied to all future assistant sessions.'
      : 'AI instructions cleared.',
  };
}
```

- [ ] **Step 6: Add `list_kpi_definitions` tool definition**

```typescript
{
  name: 'list_kpi_definitions',
  description: 'List all KPI definitions for this organization. Use this before creating, updating, or deleting metrics to see what already exists.',
  input_schema: {
    type: 'object' as const,
    properties: {},
  },
},
```

- [ ] **Step 7: Add `list_kpi_definitions` executor**

```typescript
case 'list_kpi_definitions': {
  const { data, error } = await supabase
    .from('kpi_definitions')
    .select('id, name, slug, unit, description, aggregation, direction, is_active, display_order')
    .eq('org_id', orgId)
    .order('display_order', { ascending: true });

  if (error) return { type: 'error', tool: toolName, message: error.message };

  const list = (data ?? []).map(k =>
    `[${k.id}] ${k.name} (${k.slug}) — unit: ${k.unit ?? 'none'}, ${k.is_active ? 'active' : 'inactive'}`
  ).join('\n');

  return {
    type: 'config_success',
    tool: toolName,
    message: data?.length
      ? `Found ${data.length} KPI definition(s):\n${list}`
      : 'No KPI definitions found for this org.',
  };
}
```

- [ ] **Step 8: Add `update_metric_definition` tool definition**

```typescript
{
  name: 'update_metric_definition',
  description: 'Update an existing KPI definition. Use list_kpi_definitions first to get the ID.',
  input_schema: {
    type: 'object' as const,
    properties: {
      id: { type: 'string', description: 'UUID of the KPI definition to update' },
      name: { type: 'string', description: 'New human-readable name' },
      unit: { type: 'string', description: 'New unit label e.g. "people", "USD"' },
      description: { type: 'string', description: 'New description' },
      aggregation: {
        type: 'string',
        enum: ['sum', 'avg', 'last', 'first'],
        description: 'How to aggregate readings',
      },
      direction: {
        type: 'string',
        enum: ['higher_is_better', 'lower_is_better', 'neutral'],
        description: 'Whether higher values are desirable',
      },
    },
    required: ['id'],
  },
},
```

- [ ] **Step 9: Add `update_metric_definition` executor**

```typescript
case 'update_metric_definition': {
  const id = toolInput.id as string;
  const patch: Record<string, unknown> = {};
  if (toolInput.name !== undefined) patch.name = toolInput.name;
  if (toolInput.unit !== undefined) patch.unit = toolInput.unit;
  if (toolInput.description !== undefined) patch.description = toolInput.description;
  if (toolInput.aggregation !== undefined) patch.aggregation = toolInput.aggregation;
  if (toolInput.direction !== undefined) patch.direction = toolInput.direction;

  if (Object.keys(patch).length === 0) {
    return { type: 'error', tool: toolName, message: 'No fields to update provided.' };
  }

  const { error } = await supabase
    .from('kpi_definitions')
    .update(patch)
    .eq('id', id)
    .eq('org_id', orgId);

  if (error) return { type: 'error', tool: toolName, message: error.message };
  return { type: 'config_success', tool: toolName, message: `KPI definition ${id} updated.` };
}
```

- [ ] **Step 10: Add `delete_metric_definition` tool definition**

```typescript
{
  name: 'delete_metric_definition',
  description: 'Soft-delete a KPI definition (sets is_active = false). Historical metric facts are preserved. Use list_kpi_definitions first to get the ID.',
  input_schema: {
    type: 'object' as const,
    properties: {
      id: { type: 'string', description: 'UUID of the KPI definition to deactivate' },
    },
    required: ['id'],
  },
},
```

- [ ] **Step 11: Add `delete_metric_definition` executor**

```typescript
case 'delete_metric_definition': {
  const id = toolInput.id as string;
  const { error } = await supabase
    .from('kpi_definitions')
    .update({ is_active: false })
    .eq('id', id)
    .eq('org_id', orgId);

  if (error) return { type: 'error', tool: toolName, message: error.message };
  return {
    type: 'config_success',
    tool: toolName,
    message: `KPI definition ${id} deactivated. Historical data preserved.`,
  };
}
```

- [ ] **Step 12: Update `lib/builder/context-bundle.ts` to include `ai_instructions` in snapshot**

In `OrgSnapshot` interface, add:
```typescript
aiInstructions: string | null;
```

In `fetchOrgSnapshot`, update the org select to include `ai_instructions`:
```typescript
supabase
  .from('organizations')
  .select('name, org_type, modules, branding, ai_instructions')
  .eq('id', orgId)
  .single(),
```

In the return object, add:
```typescript
aiInstructions: (org.ai_instructions as string | null) ?? null,
```

- [ ] **Step 13: Run tests**

Run: `npx vitest run lib/builder/__tests__/builder-tools-kpi.test.ts`
Expected: PASS

- [ ] **Step 14: Commit**

```bash
git add lib/builder/tools.ts lib/builder/context-bundle.ts lib/builder/__tests__/builder-tools-kpi.test.ts
git commit -m "feat: Builder tools — set_ai_instructions, KPI CRUD, org name in branding"
```

---

## Task 7: Scaffold Context Harness

**Files:**
- Create: `lib/builder/scaffold-context.ts`
- Test: `lib/builder/__tests__/scaffold-context.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// lib/builder/__tests__/scaffold-context.test.ts
import { describe, it, expect } from 'vitest';

describe('getNextMigrationNumber', () => {
  it('returns a zero-padded 4-digit string', async () => {
    const { getNextMigrationNumber } = await import('../scaffold-context');
    const num = getNextMigrationNumber();
    expect(num).toMatch(/^\d{4}$/);
    expect(parseInt(num, 10)).toBeGreaterThan(0);
  });
});

describe('buildScaffoldContext', () => {
  it('returns an object with templateFiles array', async () => {
    const { buildScaffoldContext } = await import('../scaffold-context');
    const ctx = buildScaffoldContext('test-index');
    expect(Array.isArray(ctx.templateFiles)).toBe(true);
    expect(ctx.templateFiles.length).toBeGreaterThan(0);
  });

  it('each templateFile has name and content', async () => {
    const { buildScaffoldContext } = await import('../scaffold-context');
    const ctx = buildScaffoldContext('test-index');
    for (const f of ctx.templateFiles) {
      expect(typeof f.name).toBe('string');
      expect(typeof f.content).toBe('string');
      expect(f.content.length).toBeGreaterThan(0);
    }
  });

  it('includes nextMigrationNumber', async () => {
    const { buildScaffoldContext } = await import('../scaffold-context');
    const ctx = buildScaffoldContext('test-index');
    expect(ctx.nextMigrationNumber).toMatch(/^\d{4}$/);
  });
});

describe('formatScaffoldContextForPrompt', () => {
  it('produces a string containing template file content', async () => {
    const { buildScaffoldContext, formatScaffoldContextForPrompt } = await import('../scaffold-context');
    const ctx = buildScaffoldContext('my-codebase-index');
    const prompt = formatScaffoldContextForPrompt(ctx);
    expect(typeof prompt).toBe('string');
    expect(prompt).toContain('my-codebase-index');
    expect(prompt).toContain('Module Scaffold Context');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/builder/__tests__/scaffold-context.test.ts`
Expected: FAIL — "Cannot find module '../scaffold-context'"

- [ ] **Step 3: Create `lib/builder/scaffold-context.ts`**

```typescript
// lib/builder/scaffold-context.ts
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = path.resolve(process.cwd());
const TEMPLATES_DIR = path.join(PROJECT_ROOT, 'templates/module');
const MIGRATIONS_DIR = path.join(PROJECT_ROOT, 'db/migrations');
const CLAUDE_MD_PATH = path.join(PROJECT_ROOT, 'CLAUDE.md');
const DONORS_ROUTE_PATH = path.join(PROJECT_ROOT, 'app/api/org/[orgId]/donors/route.ts');
const DONORS_COMPONENT_PATH = path.join(PROJECT_ROOT, 'components/donors/DonorList.tsx');

export interface ScaffoldContext {
  templateFiles: Array<{ name: string; content: string }>;
  exampleModule: string;
  claudeMdExcerpt: string;
  nextMigrationNumber: string;
  codebaseIndex: string;
}

export function buildScaffoldContext(codebaseIndex: string): ScaffoldContext {
  return {
    templateFiles: readTemplateFiles(),
    exampleModule: buildDonorsExample(),
    claudeMdExcerpt: extractClaudeMdExcerpt(),
    nextMigrationNumber: getNextMigrationNumber(),
    codebaseIndex,
  };
}

function readTemplateFiles(): Array<{ name: string; content: string }> {
  const result: Array<{ name: string; content: string }> = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        const rel = path.relative(TEMPLATES_DIR, fullPath);
        result.push({ name: rel, content: fs.readFileSync(fullPath, 'utf-8') });
      }
    }
  }
  walk(TEMPLATES_DIR);
  return result;
}

function buildDonorsExample(): string {
  const routeContent = fs.existsSync(DONORS_ROUTE_PATH)
    ? fs.readFileSync(DONORS_ROUTE_PATH, 'utf-8').slice(0, 3000)
    : '(donors route not found)';
  const componentContent = fs.existsSync(DONORS_COMPONENT_PATH)
    ? fs.readFileSync(DONORS_COMPONENT_PATH, 'utf-8').slice(0, 2000)
    : '(donors component not found)';

  return `### Example: donors module API route (app/api/org/[orgId]/donors/route.ts)\n\`\`\`typescript\n${routeContent}\n\`\`\`\n\n### Example: DonorList component (components/donors/DonorList.tsx)\n\`\`\`typescript\n${componentContent}\n\`\`\`\n`;
}

function extractClaudeMdExcerpt(): string {
  if (!fs.existsSync(CLAUDE_MD_PATH)) return '(CLAUDE.md not found)';
  const full = fs.readFileSync(CLAUDE_MD_PATH, 'utf-8');
  // Extract the Key Patterns, Database Conventions, Common Pitfalls sections
  const startMarker = '## Key Patterns';
  const endMarker = '## Getting Help';
  const start = full.indexOf(startMarker);
  const end = full.indexOf(endMarker);
  if (start === -1) return full.slice(0, 2000);
  const excerpt = end === -1 ? full.slice(start) : full.slice(start, end);
  return excerpt.slice(0, 3000); // cap at ~3KB
}

export function getNextMigrationNumber(): string {
  const files = fs.readdirSync(MIGRATIONS_DIR);
  const numbers = files
    .filter(f => /^\d{4}_/.test(f))
    .map(f => parseInt(f.slice(0, 4), 10))
    .filter(n => !isNaN(n));
  const max = numbers.length > 0 ? Math.max(...numbers) : 0;
  return String(max + 1).padStart(4, '0');
}

export function formatScaffoldContextForPrompt(ctx: ScaffoldContext): string {
  let out = '\n\n## Module Scaffold Context\n\n';

  out += '### Template Files (use these as your structural guide)\n';
  for (const f of ctx.templateFiles) {
    out += `\n#### templates/module/${f.name}\n\`\`\`\n${f.content}\n\`\`\`\n`;
  }

  out += '\n### Worked Example — donors module\n';
  out += ctx.exampleModule;

  out += '\n### Codebase Conventions (from CLAUDE.md)\n';
  out += ctx.claudeMdExcerpt;

  out += `\n\n### Next available migration number: ${ctx.nextMigrationNumber}\n`;
  out += `Use this exact number (zero-padded to 4 digits) for the migration filename.\n`;

  out += '\n### Current codebase index\n';
  out += ctx.codebaseIndex;

  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/builder/__tests__/scaffold-context.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/builder/scaffold-context.ts lib/builder/__tests__/scaffold-context.test.ts
git commit -m "feat: scaffold context harness — templates, example module, CLAUDE.md excerpt, next migration number"
```

---

## Task 8: `scaffold_module` Tool — Phase 1 (Planning)

**Files:**
- Modify: `lib/builder/tools.ts`
- Test: `lib/builder/__tests__/scaffold-module-tool.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// lib/builder/__tests__/scaffold-module-tool.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('scaffold_module tool', () => {
  const src = readFileSync('lib/builder/tools.ts', 'utf8');

  it('exports scaffold_module tool definition', () => {
    expect(src).toMatch(/name:\s*['"]scaffold_module['"]/);
  });

  it('scaffold_module requires a description parameter', () => {
    const idx = src.indexOf("'scaffold_module'");
    const snippet = src.slice(idx, idx + 500);
    expect(snippet).toMatch(/required.*description|description.*required/s);
  });

  it('ToolResult union includes scaffold_plan_ready type', () => {
    expect(src).toMatch(/scaffold_plan_ready/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/builder/__tests__/scaffold-module-tool.test.ts`
Expected: FAIL

- [ ] **Step 3: Add `scaffold_plan_ready` to `ToolResult` union type**

Find the `ToolResult` type definition and add:
```typescript
export type ToolResult =
  | { type: 'config_success'; tool: string; message: string }
  | { type: 'proposal_created'; proposalId: string; summary: string; fileCount: number }
  | { type: 'scaffold_plan_ready'; proposalId: string; planContent: ScaffoldPlanContent }
  | { type: 'error'; tool: string; message: string };
```

Add `ScaffoldPlanContent` interface above `ToolResult`:
```typescript
export interface ScaffoldPlanContent {
  moduleName: string;
  moduleSlug: string;
  moduleIcon: string;
  tables: Array<{
    name: string;
    columns: Array<{ name: string; type: string; nullable: boolean }>;
  }>;
  files: Array<{ path: string; description: string }>;
  registryEntry: string;
  apiShape: string;
}
```

- [ ] **Step 4: Add `scaffold_module` tool definition to `BUILDER_TOOLS`**

```typescript
{
  name: 'scaffold_module',
  description: 'Generate a complete new feature module from a plain-English description. Runs a three-phase process: planning (immediate), building (async background job), and review. Returns a plan card the admin must approve before building starts.',
  input_schema: {
    type: 'object' as const,
    properties: {
      description: {
        type: 'string',
        description: 'Plain-English description of the module e.g. "Add a volunteer tracking module with fields for hours logged, volunteer role, and org unit"',
      },
    },
    required: ['description'],
  },
},
```

- [ ] **Step 5: Add `scaffold_module` executor case**

Add the following imports at the top of `lib/builder/tools.ts`:
```typescript
import { createAIProvider } from '@/lib/ai/factory';
import { AI_MODELS } from '@/lib/ai/models';
import { buildScaffoldContext, formatScaffoldContextForPrompt } from './scaffold-context';
import { getCodebaseIndex, formatIndexForPrompt } from './codebase-index';
```

Add the executor case:
```typescript
case 'scaffold_module': {
  const description = toolInput.description as string;

  // Build scaffold context
  let indexStr = '';
  try {
    const index = getCodebaseIndex();
    indexStr = formatIndexForPrompt(index);
  } catch { /* proceed without index */ }

  const scaffoldCtx = buildScaffoldContext(indexStr);
  const contextPrompt = formatScaffoldContextForPrompt(scaffoldCtx);

  // Phase 1: planning Claude call
  const provider = createAIProvider();
  const planningSystemPrompt = `You are a senior software engineer planning a new feature module for the Benevolence platform — a white-label philanthropic portfolio management system built with Next.js 15, TypeScript, Supabase (PostgreSQL + RLS), and Tailwind CSS.${contextPrompt}`;

  const planningUserPrompt = `Admin request: "${description}"

Based on the module templates and codebase conventions above, create a detailed implementation plan.

Respond with ONLY a valid JSON object matching this exact schema (no markdown, no explanation):
{
  "moduleName": "Volunteer Tracking",
  "moduleSlug": "volunteer_tracking",
  "moduleIcon": "users",
  "tables": [
    {
      "name": "volunteer_records",
      "columns": [
        { "name": "id", "type": "uuid", "nullable": false },
        { "name": "organization_id", "type": "uuid", "nullable": false }
      ]
    }
  ],
  "files": [
    { "path": "db/migrations/${scaffoldCtx.nextMigrationNumber}_volunteer_tracking.sql", "description": "Migration for volunteer_records table" },
    { "path": "lib/modules/registry.ts", "description": "Add volunteer_tracking to MODULE_REGISTRY" },
    { "path": "app/api/org/[orgId]/volunteer-tracking/route.ts", "description": "GET + POST API route" },
    { "path": "components/volunteer-tracking/VolunteerTrackingList.tsx", "description": "List component" },
    { "path": "app/dashboard/volunteer-tracking/page.tsx", "description": "Dashboard page" }
  ],
  "registryEntry": "volunteer_tracking: { id: 'volunteer_tracking', name: 'Volunteer Tracking', ... }",
  "apiShape": "Fields: hours_logged (number), volunteer_role (string), org_unit (string)"
}`;

  const planResponse = await provider.createMessage({
    model: AI_MODELS.scaffoldPlan,
    maxTokens: 4096,
    messages: [{ role: 'user', content: planningUserPrompt }],
    system: planningSystemPrompt,
  });

  const textBlock = planResponse.content.find(b => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    return { type: 'error', tool: toolName, message: 'Planning call returned no text.' };
  }

  let planContent: ScaffoldPlanContent;
  try {
    // Strip any accidental markdown fences
    const raw = textBlock.text.replace(/^```json?\n?|```$/gm, '').trim();
    planContent = JSON.parse(raw) as ScaffoldPlanContent;
  } catch {
    return { type: 'error', tool: toolName, message: `Failed to parse plan JSON: ${textBlock.text.slice(0, 200)}` };
  }

  // Create proposal row in DB
  const { data: proposal, error: proposalError } = await adminSupabase
    .from('builder_proposals')
    .insert({
      org_id: orgId,
      requested_by: userId,
      request_text: requestText,
      proposal_type: 'code',
      status: 'pending',
      phase: 'plan_ready',
      plan_content: planContent,
      generated_code: { files: [] },
    })
    .select('id')
    .single();

  if (proposalError || !proposal) {
    return { type: 'error', tool: toolName, message: proposalError?.message ?? 'Failed to create proposal.' };
  }

  return {
    type: 'scaffold_plan_ready',
    proposalId: proposal.id,
    planContent,
  };
}
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run lib/builder/__tests__/scaffold-module-tool.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add lib/builder/tools.ts lib/builder/__tests__/scaffold-module-tool.test.ts
git commit -m "feat: scaffold_module tool — Phase 1 planning with structured plan_content"
```

---

## Task 9: Scaffold BullMQ Worker — Phase 2 (Build) and Phase 3 (Review)

**Files:**
- Create: `lib/builder/scaffold-worker.ts`
- Test: `lib/builder/__tests__/scaffold-worker.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// lib/builder/__tests__/scaffold-worker.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('scaffold-worker', () => {
  const src = readFileSync('lib/builder/scaffold-worker.ts', 'utf8');

  it('exports scaffoldQueue', () => {
    expect(src).toMatch(/export.*scaffoldQueue|export const scaffoldQueue/);
  });

  it('exports enqueueScaffoldBuildJob', () => {
    expect(src).toMatch(/export.*enqueueScaffoldBuildJob/);
  });

  it('exports createScaffoldWorker', () => {
    expect(src).toMatch(/export.*createScaffoldWorker/);
  });

  it('uses REDIS_URL for connection', () => {
    expect(src).toMatch(/REDIS_URL/);
  });

  it('updates proposal phase to building when job starts', () => {
    expect(src).toMatch(/phase.*building|building.*phase/);
  });

  it('updates proposal phase to ready_to_apply after review', () => {
    expect(src).toMatch(/ready_to_apply/);
  });

  it('writes review_report to proposal', () => {
    expect(src).toMatch(/review_report/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/builder/__tests__/scaffold-worker.test.ts`
Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Create `lib/builder/scaffold-worker.ts`**

```typescript
// lib/builder/scaffold-worker.ts
import { Queue, Worker, type Job } from 'bullmq';
import { createAdminClient } from '@/lib/supabase';
import { createAIProvider } from '@/lib/ai/factory';
import { AI_MODELS } from '@/lib/ai/models';
import { buildScaffoldContext, formatScaffoldContextForPrompt } from './scaffold-context';
import { getCodebaseIndex, formatIndexForPrompt } from './codebase-index';
import type { ScaffoldPlanContent } from './tools';

const redisConnection = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
};

export const scaffoldQueue = new Queue('scaffold-jobs', { connection: redisConnection });

export interface ScaffoldBuildJobData {
  proposalId: string;
  orgId: string;
}

export async function enqueueScaffoldBuildJob(data: ScaffoldBuildJobData): Promise<string> {
  const job = await scaffoldQueue.add('scaffold-build', data, {
    attempts: 1,
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 25 },
  });
  return job.id ?? '';
}

export function createScaffoldWorker(): Worker {
  const worker = new Worker(
    'scaffold-jobs',
    async (job: Job) => {
      if (job.name === 'scaffold-build') {
        await runBuildPhase(job.data as ScaffoldBuildJobData);
      }
    },
    { connection: redisConnection, concurrency: 1 }
  );

  worker.on('failed', (job, err) => {
    console.error(`[scaffold-worker] Job ${job?.id} failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.log(`[scaffold-worker] Job ${job.id} (${job.name}) completed`);
  });

  return worker;
}

async function runBuildPhase(data: ScaffoldBuildJobData): Promise<void> {
  const { proposalId } = data;
  const supabase = createAdminClient();

  // 1. Fetch proposal and plan
  const { data: proposal, error: fetchError } = await supabase
    .from('builder_proposals')
    .select('plan_content, org_id')
    .eq('id', proposalId)
    .single();

  if (fetchError || !proposal?.plan_content) {
    throw new Error(`Proposal ${proposalId} not found or has no plan_content`);
  }

  const planContent = proposal.plan_content as ScaffoldPlanContent;

  // 2. Mark as building
  await supabase
    .from('builder_proposals')
    .update({ phase: 'building' })
    .eq('id', proposalId);

  // 3. Build scaffold context
  let indexStr = '';
  try {
    const index = getCodebaseIndex();
    indexStr = formatIndexForPrompt(index);
  } catch { /* proceed without index */ }

  const scaffoldCtx = buildScaffoldContext(indexStr);
  const contextPrompt = formatScaffoldContextForPrompt(scaffoldCtx);

  const systemPrompt = `You are a senior software engineer implementing a module for the Benevolence platform.${contextPrompt}`;

  const provider = createAIProvider();
  const generatedFiles: Array<{ path: string; content: string }> = [];

  // 4. Generate each file sequentially
  for (const file of planContent.files) {
    const userPrompt = `Module plan:\n${JSON.stringify(planContent, null, 2)}\n\nImplement this specific file: ${file.path}\n${file.description}\n\nReturn ONLY the complete file content with no explanation or markdown fences.`;

    const response = await provider.createMessage({
      model: AI_MODELS.scaffoldBuild,
      maxTokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    const content = textBlock?.type === 'text' ? textBlock.text : '';
    generatedFiles.push({ path: file.path, content });

    // Persist progress after each file
    await supabase
      .from('builder_proposals')
      .update({ generated_code: { files: generatedFiles } })
      .eq('id', proposalId);
  }

  // 5. Mark build complete
  await supabase
    .from('builder_proposals')
    .update({ phase: 'build_ready' })
    .eq('id', proposalId);

  // 6. Run review phase immediately
  await runReviewPhase(proposalId, planContent, generatedFiles);
}

async function runReviewPhase(
  proposalId: string,
  planContent: ScaffoldPlanContent,
  generatedFiles: Array<{ path: string; content: string }>
): Promise<void> {
  const supabase = createAdminClient();

  await supabase
    .from('builder_proposals')
    .update({ phase: 'reviewing' })
    .eq('id', proposalId);

  const provider = createAIProvider();

  const filesText = generatedFiles
    .map(f => `### ${f.path}\n\`\`\`\n${f.content.slice(0, 3000)}\n\`\`\``)
    .join('\n\n');

  const reviewPrompt = `Review this generated module implementation against the plan and Benevolence codebase standards.

Module plan:
${JSON.stringify(planContent, null, 2)}

Generated files:
${filesText}

Check for:
1. Missing auth guards (routes must use is_org_admin or is_org_member checks)
2. RLS policy gaps (every new table needs read/write/service_role policies)
3. Naming inconsistencies (slug, table names, component names must be consistent)
4. Type mismatches (TypeScript types should match DB column definitions)

Respond with ONLY a valid JSON object (no markdown fences):
{
  "score": 85,
  "findings": [
    { "severity": "error", "description": "..." },
    { "severity": "warning", "description": "..." }
  ]
}

Score: 0=unusable, 60=has issues, 80=minor issues only, 95+=production ready`;

  const response = await provider.createMessage({
    model: AI_MODELS.scaffoldReview,
    maxTokens: 2048,
    messages: [{ role: 'user', content: reviewPrompt }],
    system: 'You are a senior code reviewer. Return only valid JSON.',
  });

  const textBlock = response.content.find(b => b.type === 'text');
  let reviewReport = { score: 0, findings: [{ severity: 'error', description: 'Review failed to produce output.' }] };

  if (textBlock?.type === 'text') {
    try {
      const raw = textBlock.text.replace(/^```json?\n?|```$/gm, '').trim();
      reviewReport = JSON.parse(raw);
    } catch {
      reviewReport = { score: 50, findings: [{ severity: 'warning', description: 'Could not parse review output.' }] };
    }
  }

  await supabase
    .from('builder_proposals')
    .update({ phase: 'ready_to_apply', review_report: reviewReport })
    .eq('id', proposalId);
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/builder/__tests__/scaffold-worker.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/builder/scaffold-worker.ts lib/builder/__tests__/scaffold-worker.test.ts
git commit -m "feat: scaffold BullMQ worker — Phase 2 build + Phase 3 review"
```

---

## Task 10: Build Trigger Endpoint + Proposal GET Endpoint

**Files:**
- Create: `app/api/org/[orgId]/builder/proposals/[proposalId]/build/route.ts`
- Create: `app/api/org/[orgId]/builder/proposals/[proposalId]/route.ts`
- Test: `lib/builder/__tests__/scaffold-endpoints.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// lib/builder/__tests__/scaffold-endpoints.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('build trigger endpoint', () => {
  const src = readFileSync(
    'app/api/org/[orgId]/builder/proposals/[proposalId]/build/route.ts',
    'utf8'
  );

  it('exports a POST handler', () => {
    expect(src).toMatch(/export async function POST/);
  });

  it('checks is_org_admin before dispatching', () => {
    expect(src).toMatch(/is_org_admin/);
  });

  it('dispatches enqueueScaffoldBuildJob', () => {
    expect(src).toMatch(/enqueueScaffoldBuildJob/);
  });

  it('updates proposal phase to building', () => {
    expect(src).toMatch(/phase.*plan_ready|plan_ready.*phase/);
  });
});

describe('proposal GET endpoint', () => {
  const src = readFileSync(
    'app/api/org/[orgId]/builder/proposals/[proposalId]/route.ts',
    'utf8'
  );

  it('exports a GET handler', () => {
    expect(src).toMatch(/export async function GET/);
  });

  it('checks org admin or member access', () => {
    expect(src).toMatch(/org_role|is_org_admin|is_org_member/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/builder/__tests__/scaffold-endpoints.test.ts`
Expected: FAIL — files don't exist yet

- [ ] **Step 3: Create build trigger endpoint**

```typescript
// app/api/org/[orgId]/builder/proposals/[proposalId]/build/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { enqueueScaffoldBuildJob } from '@/lib/builder/scaffold-worker';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; proposalId: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, proposalId } = await params;
    const supabase = await createServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
    if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const adminSupabase = createAdminClient();

    // Verify proposal is in plan_ready state and belongs to this org
    const { data: proposal, error: fetchError } = await adminSupabase
      .from('builder_proposals')
      .select('id, phase, org_id')
      .eq('id', proposalId)
      .eq('org_id', orgId)
      .single();

    if (fetchError || !proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    if (proposal.phase !== 'plan_ready') {
      return NextResponse.json(
        { error: `Proposal must be in plan_ready phase, currently: ${proposal.phase}` },
        { status: 409 }
      );
    }

    // Dispatch build job
    const jobId = await enqueueScaffoldBuildJob({ proposalId, orgId });

    return NextResponse.json({ jobId, proposalId });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Create proposal GET endpoint**

```typescript
// app/api/org/[orgId]/builder/proposals/[proposalId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; proposalId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId, proposalId } = await params;
    const supabase = await createServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: role } = await supabase.rpc('org_role', { p_org_id: orgId });
    if (!role) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const adminSupabase = createAdminClient();
    const { data: proposal, error } = await adminSupabase
      .from('builder_proposals')
      .select('id, phase, plan_content, generated_code, review_report, created_at')
      .eq('id', proposalId)
      .eq('org_id', orgId)
      .single();

    if (error || !proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    return NextResponse.json({ proposal });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run lib/builder/__tests__/scaffold-endpoints.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add "app/api/org/[orgId]/builder/proposals/[proposalId]/build/route.ts" \
        "app/api/org/[orgId]/builder/proposals/[proposalId]/route.ts" \
        lib/builder/__tests__/scaffold-endpoints.test.ts
git commit -m "feat: build trigger endpoint + proposal GET endpoint"
```

---

## Task 11: Apply Endpoint

**Files:**
- Create: `app/api/admin/builder/proposals/[proposalId]/apply/route.ts`
- Test: `lib/builder/__tests__/apply-endpoint.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// lib/builder/__tests__/apply-endpoint.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('apply endpoint', () => {
  const src = readFileSync(
    'app/api/admin/builder/proposals/[proposalId]/apply/route.ts',
    'utf8'
  );

  it('exports a POST handler', () => {
    expect(src).toMatch(/export async function POST/);
  });

  it('requires super_admin', () => {
    expect(src).toMatch(/is_super_admin/);
  });

  it('uses fs.writeFileSync to write files', () => {
    expect(src).toMatch(/writeFileSync|writeFile/);
  });

  it('updates phase to applied', () => {
    expect(src).toMatch(/applied/);
  });

  it('does not run git commands', () => {
    expect(src).not.toMatch(/git add|git commit|execSync.*git/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/builder/__tests__/apply-endpoint.test.ts`
Expected: FAIL — file doesn't exist

- [ ] **Step 3: Create the apply endpoint**

```typescript
// app/api/admin/builder/proposals/[proposalId]/apply/route.ts
import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ proposalId: string }>;
}

const PROJECT_ROOT = path.resolve(process.cwd());

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const { proposalId } = await params;
    const supabase = await createServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_super_admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const adminSupabase = createAdminClient();
    const { data: proposal, error: fetchError } = await adminSupabase
      .from('builder_proposals')
      .select('id, phase, generated_code, org_id')
      .eq('id', proposalId)
      .single();

    if (fetchError || !proposal) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    if (proposal.phase !== 'ready_to_apply') {
      return NextResponse.json(
        { error: `Proposal must be ready_to_apply, currently: ${proposal.phase}` },
        { status: 409 }
      );
    }

    const files = (proposal.generated_code as { files: Array<{ path: string; content: string }> })?.files ?? [];

    if (files.length === 0) {
      return NextResponse.json({ error: 'No generated files to apply.' }, { status: 400 });
    }

    const writtenPaths: string[] = [];

    for (const file of files) {
      // Normalize path: strip any leading slash or "./"
      const cleanPath = file.path.replace(/^[./]+/, '');
      const absolutePath = path.join(PROJECT_ROOT, cleanPath);

      // Safety: ensure the resolved path stays within the project root
      if (!absolutePath.startsWith(PROJECT_ROOT + path.sep)) {
        return NextResponse.json(
          { error: `Path traversal detected: ${file.path}` },
          { status: 400 }
        );
      }

      // Create parent directories if needed
      fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
      fs.writeFileSync(absolutePath, file.content, 'utf-8');
      writtenPaths.push(cleanPath);
    }

    // Mark as applied
    await adminSupabase
      .from('builder_proposals')
      .update({
        phase: 'applied',
        status: 'applied',
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', proposalId);

    return NextResponse.json({ applied: true, files: writtenPaths });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run lib/builder/__tests__/apply-endpoint.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add "app/api/admin/builder/proposals/[proposalId]/apply/route.ts" \
        lib/builder/__tests__/apply-endpoint.test.ts
git commit -m "feat: apply endpoint — writes scaffold files to disk"
```

---

## Task 12: Phase-Aware UI Cards + BuilderChat Update

**Files:**
- Create: `components/settings/builder/PlanCard.tsx`
- Create: `components/settings/builder/BuildProgressCard.tsx`
- Create: `components/settings/builder/ReviewReportCard.tsx`
- Modify: `components/settings/BuilderChat.tsx`

- [ ] **Step 1: Create `components/settings/builder/PlanCard.tsx`**

```tsx
// components/settings/builder/PlanCard.tsx
'use client';

import { useState } from 'react';
import { CheckCircle, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import type { ScaffoldPlanContent } from '@/lib/builder/tools';

interface PlanCardProps {
  orgId: string;
  proposalId: string;
  planContent: ScaffoldPlanContent;
  onApproved: () => void;
}

export default function PlanCard({ orgId, proposalId, planContent, onApproved }: PlanCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApprove() {
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/org/${orgId}/builder/proposals/${proposalId}/build`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to start build');
      onApproved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setApproving(false);
    }
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 text-blue-900 text-sm max-w-[90%]">
      <button
        className="w-full flex items-center justify-between px-4 py-3 font-medium"
        onClick={() => setExpanded(e => !e)}
      >
        <span>Module Plan: {planContent.moduleName}</span>
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-blue-200">
          <div className="mt-3">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Tables</p>
            {planContent.tables.map(t => (
              <div key={t.name} className="text-xs text-blue-800 mb-1">
                <span className="font-mono font-medium">{t.name}</span>
                {' '}— {t.columns.filter(c => c.name !== 'id' && c.name !== 'organization_id' && !c.name.endsWith('_at')).map(c => c.name).join(', ')}
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1">Files</p>
            <ul className="space-y-0.5">
              {planContent.files.map(f => (
                <li key={f.path} className="text-xs font-mono text-blue-700 truncate">
                  {f.path}
                </li>
              ))}
            </ul>
          </div>

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleApprove}
            disabled={approving}
            className="mt-2 flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {approving ? (
              <>
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Starting build…
              </>
            ) : (
              <>
                <CheckCircle className="w-3.5 h-3.5" />
                Approve Plan &amp; Build
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `components/settings/builder/BuildProgressCard.tsx`**

```tsx
// components/settings/builder/BuildProgressCard.tsx
'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, Circle, Loader, AlertCircle } from 'lucide-react';

interface FileStatus {
  path: string;
  status: 'pending' | 'done' | 'error';
}

interface Proposal {
  phase: string;
  plan_content: { files: Array<{ path: string }> } | null;
  generated_code: { files: Array<{ path: string; content: string }> } | null;
  review_report: { score: number; findings: Array<{ severity: string; description: string }> } | null;
}

interface BuildProgressCardProps {
  orgId: string;
  proposalId: string;
  plannedFiles: Array<{ path: string }>;
  onComplete: (proposal: Proposal) => void;
}

export default function BuildProgressCard({ orgId, proposalId, plannedFiles, onComplete }: BuildProgressCardProps) {
  const [fileStatuses, setFileStatuses] = useState<FileStatus[]>(
    plannedFiles.map(f => ({ path: f.path, status: 'pending' }))
  );
  const [phase, setPhase] = useState<string>('building');

  useEffect(() => {
    let active = true;

    async function poll() {
      while (active) {
        await new Promise(r => setTimeout(r, 2000));
        if (!active) break;

        try {
          const res = await fetch(`/api/org/${orgId}/builder/proposals/${proposalId}`);
          if (!res.ok) continue;
          const { proposal } = await res.json() as { proposal: Proposal };

          const doneFiles = new Set(
            (proposal.generated_code?.files ?? []).map(f => f.path)
          );

          setFileStatuses(plannedFiles.map(f => ({
            path: f.path,
            status: doneFiles.has(f.path) ? 'done' : 'pending',
          })));

          setPhase(proposal.phase);

          if (proposal.phase === 'ready_to_apply' || proposal.phase === 'applied') {
            active = false;
            onComplete(proposal);
          }
        } catch { /* retry on next tick */ }
      }
    }

    poll();
    return () => { active = false; };
  }, [orgId, proposalId, plannedFiles, onComplete]);

  const doneCount = fileStatuses.filter(f => f.status === 'done').length;
  const isReviewing = phase === 'reviewing';

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 text-amber-900 text-sm max-w-[90%] px-4 py-3">
      <p className="font-medium mb-2">
        {isReviewing ? 'Reviewing generated code…' : `Building module — ${doneCount}/${fileStatuses.length} files`}
      </p>
      <ul className="space-y-1">
        {fileStatuses.map(f => (
          <li key={f.path} className="flex items-center gap-2 text-xs font-mono">
            {f.status === 'done' ? (
              <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />
            ) : isReviewing ? (
              <Loader className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-spin" />
            ) : doneCount < fileStatuses.indexOf(f) ? (
              <Loader className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-spin" />
            ) : (
              <Circle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
            )}
            <span className={f.status === 'done' ? 'text-green-700' : 'text-amber-700'}>{f.path}</span>
          </li>
        ))}
      </ul>
      {isReviewing && (
        <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
          <Loader className="w-3 h-3 animate-spin" />
          Running code review…
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create `components/settings/builder/ReviewReportCard.tsx`**

```tsx
// components/settings/builder/ReviewReportCard.tsx
'use client';

import { useState } from 'react';
import { CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronRight, ExternalLink } from 'lucide-react';

interface Finding {
  severity: 'error' | 'warning' | 'info';
  description: string;
}

interface ReviewReportCardProps {
  score: number;
  findings: Finding[];
  proposalId: string;
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-green-700 bg-green-50 border-green-200'
    : score >= 60 ? 'text-amber-700 bg-amber-50 border-amber-200'
    : 'text-red-700 bg-red-50 border-red-200';
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${color}`}>
      {score >= 80 ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
      {score}/100
    </span>
  );
}

export default function ReviewReportCard({ score, findings, proposalId }: ReviewReportCardProps) {
  const hasIssues = findings.some(f => f.severity === 'error' || f.severity === 'warning');
  const [expanded, setExpanded] = useState(hasIssues || score < 80);

  const errors = findings.filter(f => f.severity === 'error');
  const warnings = findings.filter(f => f.severity === 'warning');
  const infos = findings.filter(f => f.severity === 'info');

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm max-w-[90%]">
      <button
        className="w-full flex items-center justify-between px-4 py-3"
        onClick={() => setExpanded(e => !e)}
      >
        <div className="flex items-center gap-2">
          <span className="font-medium">Review Report</span>
          <ScoreBadge score={score} />
        </div>
        {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-200 space-y-2 mt-2">
          {errors.map((f, i) => (
            <div key={i} className="flex gap-2 text-xs text-red-700">
              <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{f.description}</span>
            </div>
          ))}
          {warnings.map((f, i) => (
            <div key={i} className="flex gap-2 text-xs text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>{f.description}</span>
            </div>
          ))}
          {infos.map((f, i) => (
            <div key={i} className="flex gap-2 text-xs text-slate-600">
              <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400" />
              <span>{f.description}</span>
            </div>
          ))}
          {findings.length === 0 && (
            <p className="text-xs text-green-700 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              No issues found.
            </p>
          )}
          <a
            href={`/admin/builder`}
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline mt-1"
          >
            View full diff in admin <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update `components/settings/BuilderChat.tsx` — add new message types**

At the top of `BuilderChat.tsx`, add imports:
```tsx
import PlanCard from './builder/PlanCard';
import BuildProgressCard from './builder/BuildProgressCard';
import ReviewReportCard from './builder/ReviewReportCard';
import type { ScaffoldPlanContent } from '@/lib/builder/tools';
```

Add new message type definitions to the union:
```typescript
interface ScaffoldPlanMessage {
  type: 'scaffold_plan';
  proposalId: string;
  planContent: ScaffoldPlanContent;
}

interface BuildProgressMessage {
  type: 'build_progress';
  proposalId: string;
  plannedFiles: Array<{ path: string }>;
}

interface ReviewReportMessage {
  type: 'review_report';
  score: number;
  findings: Array<{ severity: 'error' | 'warning' | 'info'; description: string }>;
  proposalId: string;
}

type ChatMessage = TextMessage | ConfigResultMessage | ProposalMessage
  | ScaffoldPlanMessage | BuildProgressMessage | ReviewReportMessage;
```

- [ ] **Step 5: Handle `scaffold_plan` SSE event in `handleSend`**

In the SSE event loop inside `handleSend`, add after the existing `proposal` event handler:
```typescript
} else if (event.type === 'scaffold_plan') {
  pendingToolResults.push({
    type: 'scaffold_plan',
    proposalId: event.proposalId as string,
    planContent: event.planContent as ScaffoldPlanContent,
  });
}
```

- [ ] **Step 6: Render new card types in the message list**

In the message render loop, add after the `proposal` card block:

```tsx
if (msg.type === 'scaffold_plan') {
  return (
    <div key={i} className="flex justify-start">
      <PlanCard
        orgId={orgId}
        proposalId={msg.proposalId}
        planContent={msg.planContent}
        onApproved={() => {
          setMessages(prev => prev.map((m, idx) => idx === i
            ? { type: 'build_progress' as const, proposalId: msg.proposalId, plannedFiles: msg.planContent.files }
            : m
          ));
        }}
      />
    </div>
  );
}

if (msg.type === 'build_progress') {
  return (
    <div key={i} className="flex justify-start">
      <BuildProgressCard
        orgId={orgId}
        proposalId={msg.proposalId}
        plannedFiles={msg.plannedFiles}
        onComplete={(proposal) => {
          setMessages(prev => prev.map((m, idx) => idx === i
            ? {
                type: 'review_report' as const,
                score: proposal.review_report?.score ?? 0,
                findings: (proposal.review_report?.findings ?? []) as Array<{ severity: 'error' | 'warning' | 'info'; description: string }>,
                proposalId: msg.proposalId,
              }
            : m
          ));
        }}
      />
    </div>
  );
}

if (msg.type === 'review_report') {
  return (
    <div key={i} className="flex justify-start">
      <ReviewReportCard
        score={msg.score}
        findings={msg.findings}
        proposalId={msg.proposalId}
      />
    </div>
  );
}
```

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no type errors in the new components or BuilderChat

- [ ] **Step 8: Run full test suite**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 9: Commit**

```bash
git add components/settings/builder/PlanCard.tsx \
        components/settings/builder/BuildProgressCard.tsx \
        components/settings/builder/ReviewReportCard.tsx \
        components/settings/BuilderChat.tsx
git commit -m "feat: phase-aware UI cards — PlanCard, BuildProgressCard, ReviewReportCard"
```

---

## Final Verification

- [ ] **Run full test suite one more time**

Run: `npx vitest run`
Expected: all tests pass, no new failures

- [ ] **TypeScript check**

Run: `npx tsc --noEmit`
Expected: clean compile

- [ ] **Review spec coverage**

Open `docs/agent-work/specs/2026-04-30-builder-enhancement-design.md` and verify each listed requirement has a corresponding task.

---

Plan complete and retained at `docs/archive/plans/2026-04-30-sprint-c-builder-enhancement.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
