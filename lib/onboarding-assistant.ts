/**
 * OnboardingAssistant
 *
 * Provider-neutral AI assistant for guiding new users through onboarding.
 * Uses conversational discovery to understand pain points, goals, and workflows,
 * then generates tailored module recommendations.
 *
 * Personality: warm, curious, conversational
 */

import type { SupabaseClient } from '@/lib/database-client';
import type { ModuleId } from './modules/registry';
import { MODULE_REGISTRY } from './modules/registry';
import { branding } from './config';
import type { AIContentBlock, AIMessage, ToolDefinition } from '@/lib/ai/types';
import { extractText } from '@/lib/ai/text';
import { createAIExecutionGateway } from '@/lib/ai/runtime';
import type { OrgType } from '@/lib/types/org';

// Types for onboarding data structures
export type OrgSize = 'solo' | 'small' | 'medium' | 'large';
export type Severity = 'low' | 'medium' | 'high';
export type Priority = 'low' | 'medium' | 'high';
export type Timeframe = 'immediate' | 'short_term' | 'long_term';

export interface QuickIntake {
  org_type?: OrgType;
  org_name?: string;
  org_size?: OrgSize;
  primary_focus?: string[];
  existing_tools?: string[];
}

export interface PainPoint {
  id: string;
  category: 'tracking' | 'reporting' | 'compliance' | 'communication' | 'efficiency' | 'other';
  description: string;
  severity: Severity;
  related_modules: ModuleId[];
  extracted_from?: string;
}

export interface Goal {
  id: string;
  goal: string;
  priority: Priority;
  timeframe: Timeframe;
  related_modules: ModuleId[];
}

export interface ConversationState {
  current_topic?: string;
  topics_covered: string[];
  confidence_scores: {
    pain_points: number;
    goals: number;
    workflows: number;
    team: number;
  };
  message_count: number;
  ready_for_recommendations: boolean;
}

export interface ModuleRecommendation {
  module_id: ModuleId;
  confidence: number;
  reasoning: string;
  pain_points_addressed: string[];
  goals_addressed: string[];
}

export interface ExcludedModule {
  module_id: ModuleId;
  reason: string;
}

// Onboarding-specific tools for the AI
const ONBOARDING_TOOLS: ToolDefinition[] = [
  {
    name: 'extract_pain_point',
    description: 'Record a pain point mentioned by the user. Use when user describes frustrations, time-consuming tasks, or challenges.',
    input_schema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['tracking', 'reporting', 'compliance', 'communication', 'efficiency', 'other'],
          description: 'Category of the pain point',
        },
        description: {
          type: 'string',
          description: 'Clear description of the pain point',
        },
        severity: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'How severe is this pain point based on user emphasis',
        },
        related_modules: {
          type: 'array',
          items: { type: 'string' },
          description: 'Module IDs that could address this: impact_tracking, reporting, tax_optimization, grant_management, donor_management, external_data, analytics',
        },
      },
      required: ['category', 'description', 'severity', 'related_modules'],
    },
  },
  {
    name: 'extract_goal',
    description: 'Record a goal or objective mentioned by the user. Use when user expresses what they want to achieve or improve.',
    input_schema: {
      type: 'object',
      properties: {
        goal: {
          type: 'string',
          description: 'Description of the goal',
        },
        priority: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Priority based on user emphasis',
        },
        timeframe: {
          type: 'string',
          enum: ['immediate', 'short_term', 'long_term'],
          description: 'When they want to achieve this',
        },
        related_modules: {
          type: 'array',
          items: { type: 'string' },
          description: 'Module IDs that could help achieve this goal',
        },
      },
      required: ['goal', 'priority', 'related_modules'],
    },
  },
  {
    name: 'extract_workflow',
    description: 'Record information about current workflows and processes.',
    input_schema: {
      type: 'object',
      properties: {
        workflow_type: {
          type: 'string',
          enum: ['grant_cycle', 'donor_communications', 'impact_tracking', 'reporting', 'automation_preferences', 'org_context', 'view_preferences'],
          description: 'Type of workflow being described. Use automation_preferences for desired reminders, follow-up tasks, notifications, or field updates. Use org_context for durable operating norms, naming conventions, process rules, or preferences the AI should remember after setup. Use view_preferences for dashboard layout, default views, table columns, and entity vocabulary.',
        },
        details: {
          type: 'object',
          description: 'Details about the workflow',
        },
      },
      required: ['workflow_type', 'details'],
    },
  },
  {
    name: 'extract_team_context',
    description: 'Record information about the team structure and technical comfort.',
    input_schema: {
      type: 'object',
      properties: {
        size: {
          type: 'string',
          enum: ['solo', 'small', 'medium', 'large'],
          description: 'Team size',
        },
        roles: {
          type: 'array',
          items: { type: 'string' },
          description: 'Team roles mentioned',
        },
        technical_comfort: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Technical comfort level',
        },
      },
    },
  },
  {
    name: 'update_conversation_state',
    description: 'Update the conversation state after each exchange. Call this to track progress.',
    input_schema: {
      type: 'object',
      properties: {
        topics_covered: {
          type: 'array',
          items: { type: 'string' },
          description: 'Topics that have been covered: daily_operations, grant_process, donor_relations, impact_measurement, reporting, current_tools, automation_preferences, org_context, view_preferences',
        },
        confidence_scores: {
          type: 'object',
          properties: {
            pain_points: { type: 'number', minimum: 0, maximum: 1 },
            goals: { type: 'number', minimum: 0, maximum: 1 },
            workflows: { type: 'number', minimum: 0, maximum: 1 },
            team: { type: 'number', minimum: 0, maximum: 1 },
          },
          description: 'Confidence scores for each area (0-1)',
        },
        ready_for_recommendations: {
          type: 'boolean',
          description: 'True when all confidence scores are > 0.7 and enough context gathered',
        },
      },
      required: ['topics_covered', 'confidence_scores'],
    },
  },
  {
    name: 'generate_recommendations',
    description: 'Generate module recommendations based on extracted information. Only call when ready_for_recommendations is true.',
    input_schema: {
      type: 'object',
      properties: {
        trigger: {
          type: 'boolean',
          description: 'Set to true to trigger recommendation generation',
        },
      },
      required: ['trigger'],
    },
  },
];

/**
 * Build the system prompt for onboarding conversations
 */
function buildOnboardingSystemPrompt(quickIntake: QuickIntake, conversationState: ConversationState): string {
  const orgTypeDescriptions: Record<OrgType, string> = {
    private_foundation: 'private foundation managing grants',
    family_office: 'family office managing investments and philanthropy',
    daf_sponsor: 'donor-advised fund sponsor',
    community_foundation: 'community foundation serving donors and local organizations',
    nonprofit: 'nonprofit organization',
    corporation: 'corporate giving program',
    individual: 'individual philanthropist',
  };

  const orgDescription = quickIntake.org_type
    ? orgTypeDescriptions[quickIntake.org_type]
    : 'philanthropic organization';

  const topicsCovered = conversationState.topics_covered || [];
  const confidenceScores = conversationState.confidence_scores || {
    pain_points: 0,
    goals: 0,
    workflows: 0,
    team: 0,
  };

  // Determine which topics to explore based on org type
  const topicsToExplore: string[] = [];
  const legacyOrgType = quickIntake.org_type as string | undefined;
  if (legacyOrgType === 'foundation' || legacyOrgType === 'daf') {
    if (!topicsCovered.includes('grant_process')) topicsToExplore.push('grant_process');
  }
  if (quickIntake.org_type === 'nonprofit') {
    if (!topicsCovered.includes('donor_relations')) topicsToExplore.push('donor_relations');
  }
  if (!topicsCovered.includes('daily_operations')) topicsToExplore.push('daily_operations');
  if (!topicsCovered.includes('impact_measurement')) topicsToExplore.push('impact_measurement');
  if (!topicsCovered.includes('reporting')) topicsToExplore.push('reporting');
  if (!topicsCovered.includes('automation_preferences')) topicsToExplore.push('automation_preferences');
  if (!topicsCovered.includes('org_context')) topicsToExplore.push('org_context');
  if (!topicsCovered.includes('view_preferences')) topicsToExplore.push('view_preferences');

  return `You lead Foundation Setup for ${branding.appName}, helping philanthropic organizations shape a useful operating space from their first conversation.

## Your Personality
- Warm, friendly, and genuinely curious
- Start with a specific, high-signal question based on what they have already shared
- Reflect back the concrete operating need you heard before moving to the next question
- Be encouraging and supportive
- Keep responses concise: one reflection and one focused question

## User Context
- Organization: ${quickIntake.org_name || 'Their organization'} (${orgDescription})
- Team size: ${quickIntake.org_size || 'unknown'}
- Focus areas: ${quickIntake.primary_focus?.join(', ') || 'not specified'}
- Current tools: ${quickIntake.existing_tools?.join(', ') || 'not specified'}

## Conversation Progress
- Topics covered: ${topicsCovered.length > 0 ? topicsCovered.join(', ') : 'none yet'}
- Topics to explore: ${topicsToExplore.length > 0 ? topicsToExplore.join(', ') : 'all covered'}
- Confidence scores: pain_points=${(confidenceScores.pain_points * 100).toFixed(0)}%, goals=${(confidenceScores.goals * 100).toFixed(0)}%, workflows=${(confidenceScores.workflows * 100).toFixed(0)}%, team=${(confidenceScores.team * 100).toFixed(0)}%
- Message count: ${conversationState.message_count || 0}

## Your Goals
1. Turn their operating needs into a clear workspace blueprint
2. Learn about their goals and what they want to improve
3. Understand their current workflows (grants, donors, reporting)
4. Capture automation preferences: deadline reminders, follow-up tasks, notifications, and field updates they want the system to handle
5. Capture durable org context: operating norms, naming conventions, process rules, and preferences the AI should remember
6. Capture view preferences: dashboard priorities, default module views, important table columns, and entity vocabulary
7. Get a sense of their team and technical comfort

## Pain Point Detection
Listen for phrases like:
- "We spend hours on..." or "It takes forever to..."
- "It's frustrating that..." or "I wish we could..."
- "We're always scrambling to..." or "We keep losing track of..."
- "Our board wants..." or "We need to show..."

## Module Mapping Reference
When you detect pain points, map them to relevant modules:
- Manual tracking, spreadsheets → impact_tracking
- Reporting takes too long, board reports → reporting, analytics
- Donor communication chaos → donor_management
- Tax receipt management → donor_management, tax_optimization
- Grant due diligence → grant_management
- Deadline/milestone tracking → grant_management
- Reminder or follow-up automation → grant_management
- Charity vetting → external_data
- Trend analysis, forecasting → analytics

## Tool Usage
- Use extract_pain_point when you detect frustrations or challenges
- Use extract_goal when you hear objectives or desires
- Use extract_workflow when you learn about processes
- Use extract_workflow with workflow_type=automation_preferences when the user mentions desired reminders, automatic task creation, notifications, or field updates
- Use extract_workflow with workflow_type=org_context when the user describes policies, vocabulary, norms, or preferences the AI should remember for the organization
- Use extract_workflow with workflow_type=view_preferences when the user describes preferred dashboard widgets, default views, visible columns, or terms like "we call grants awards"
- Use extract_team_context when you learn about the team
- Use update_conversation_state after each exchange to track progress
- Use generate_recommendations ONLY when all confidence scores are > 0.7 AND you've had at least 4-5 exchanges

## Conversation Flow
1. Start with the most important outcome they want from the workspace in the next 90 days
2. Follow up on the single workflow or decision that makes that outcome difficult today
3. Ask which information they need at a glance and who needs it
4. Ask which recurring reminders or follow-ups they wish happened automatically
5. Ask whether there are policies, vocabulary choices, or operating norms the AI should remember
6. Summarize the emerging blueprint before asking for anything else
7. When ready, offer to show and apply their Foundation Setup

## Important Guidelines
- Don't mention modules by name until recommendations
- Focus on understanding their needs, not selling features
- If they seem ready to move on, offer recommendations
- Never ask the same broad question twice
- Do not use generic acknowledgments such as "I've noted that information"
- Keep the conversation natural, specific, and grounded in the details they shared`;
}

/**
 * OnboardingAssistant class for handling onboarding conversations
 */
export class OnboardingAssistant {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  /**
   * Process a message in the onboarding conversation
   */
  async chat(params: {
    sessionId: string;
    userId: string;
    orgId?: string;
    message: string;
    quickIntake: QuickIntake;
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
    conversationState?: ConversationState;
  }) {
    const {
      sessionId,
      userId,
      orgId,
      message,
      quickIntake,
      conversationHistory = [],
      conversationState = {
        topics_covered: [],
        confidence_scores: { pain_points: 0, goals: 0, workflows: 0, team: 0 },
        message_count: 0,
        ready_for_recommendations: false,
      },
    } = params;

    // Build system prompt
    const systemPrompt = buildOnboardingSystemPrompt(quickIntake, conversationState);

    const currentMessages: AIMessage[] = [
      ...conversationHistory.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      })),
      { role: 'user', content: message },
    ];

    const extractions: {
      pain_points: PainPoint[];
      goals: Goal[];
      workflows: Record<string, any>;
      team_context: Record<string, any>;
      updated_state?: ConversationState;
      trigger_recommendations?: boolean;
    } = {
      pain_points: [],
      goals: [],
      workflows: {},
      team_context: {},
    };

    let textContent = '';
    const MAX_TOOL_TURNS = 4;
    const gateway = createAIExecutionGateway({
      kind: orgId ? 'organization' : 'platform',
      orgId,
      actorId: userId,
      sessionId,
    });
    const executionPlan = await gateway.resolve('onboarding');

    // A model may need more than one tool round before it has enough persisted
    // context to give the user a useful reply. Keep its full tool transcript.
    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      const response = await gateway.runToolConversation(executionPlan, {
        maxOutputTokens: 2048,
        system: systemPrompt,
        tools: ONBOARDING_TOOLS,
        messages: currentMessages,
      });
      const turnText = extractText(response);
      if (turnText.trim()) textContent = turnText;

      const toolUseBlocks = response.content.filter(
        (block): block is AIContentBlock & { type: 'tool_use' } => block.type === 'tool_use'
      );
      if (toolUseBlocks.length === 0 || response.stopReason !== 'tool_use') break;

      const toolResults: Array<{ tool_use_id: string; content: string }> = [];
      for (const toolUse of toolUseBlocks) {
        const args = toolUse.input as Record<string, any>;

        switch (toolUse.name) {
          case 'extract_pain_point': {
            const painPoint: PainPoint = {
              id: crypto.randomUUID(),
              category: args.category,
              description: args.description,
              severity: args.severity,
              related_modules: args.related_modules as ModuleId[],
              extracted_from: message,
            };
            extractions.pain_points.push(painPoint);
            toolResults.push({
              tool_use_id: toolUse.id,
              content: JSON.stringify({ success: true, pain_point_id: painPoint.id }),
            });
            break;
          }

          case 'extract_goal': {
            const goal: Goal = {
              id: crypto.randomUUID(),
              goal: args.goal,
              priority: args.priority,
              timeframe: args.timeframe || 'short_term',
              related_modules: args.related_modules as ModuleId[],
            };
            extractions.goals.push(goal);
            toolResults.push({
              tool_use_id: toolUse.id,
              content: JSON.stringify({ success: true, goal_id: goal.id }),
            });
            break;
          }

          case 'extract_workflow': {
            extractions.workflows[args.workflow_type] = args.details;
            toolResults.push({
              tool_use_id: toolUse.id,
              content: JSON.stringify({ success: true, workflow_type: args.workflow_type }),
            });
            break;
          }

          case 'extract_team_context': {
            extractions.team_context = { ...extractions.team_context, ...args };
            toolResults.push({
              tool_use_id: toolUse.id,
              content: JSON.stringify({ success: true }),
            });
            break;
          }

          case 'update_conversation_state': {
            extractions.updated_state = {
              topics_covered: args.topics_covered || [],
              confidence_scores: args.confidence_scores || conversationState.confidence_scores,
              message_count: (conversationState.message_count || 0) + 1,
              ready_for_recommendations: args.ready_for_recommendations || false,
            };
            toolResults.push({
              tool_use_id: toolUse.id,
              content: JSON.stringify({ success: true, state: extractions.updated_state }),
            });
            break;
          }

          case 'generate_recommendations': {
            extractions.trigger_recommendations = args.trigger;
            toolResults.push({
              tool_use_id: toolUse.id,
              content: JSON.stringify({
                success: true,
                message: 'Recommendations will be generated. Inform the user they can now see their personalized recommendations.',
              }),
            });
            break;
          }
        }
      }

      currentMessages.push(
        { role: 'assistant', content: response.content },
        {
          role: 'user',
          content: toolResults.map(tr => ({
            type: 'tool_result' as const,
            tool_use_id: tr.tool_use_id,
            content: tr.content,
          })),
        }
      );
    }

    // Tool-only responses should still move the setup forward without repeating
    // a generic day-in-the-life question.
    if (!textContent.trim()) {
      const covered = new Set(extractions.updated_state?.topics_covered || conversationState.topics_covered || []);
      textContent = !covered.has('daily_operations')
        ? 'To shape the first version of your workspace, what is the one recurring decision, deadline, or handoff that is hardest to manage today?'
        : !covered.has('reporting')
          ? 'What does your board or leadership team need to see regularly, and how do you prepare that today?'
          : 'I have enough to sketch a useful first setup. Is there one more workflow or preference you want reflected before we do that?';
    }

    // Update session with new extractions
    await this.updateSessionData(sessionId, extractions);

    return {
      message: textContent,
      extractions,
      updated_state: extractions.updated_state || {
        ...conversationState,
        message_count: (conversationState.message_count || 0) + 1,
      },
      trigger_recommendations: extractions.trigger_recommendations || false,
    };
  }

  /**
   * Generate module recommendations based on profile
   */
  async generateRecommendations(sessionId: string): Promise<{
    recommendations: ModuleRecommendation[];
    excluded: ExcludedModule[];
  }> {
    // Fetch the profile
    const { data: profile } = await this.supabase
      .from('onboarding_profiles')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    const { data: session } = await this.supabase
      .from('onboarding_sessions')
      .select('quick_intake')
      .eq('id', sessionId)
      .single();

    if (!profile || !session) {
      throw new Error('Session or profile not found');
    }

    const painPoints = (profile.pain_points || []) as PainPoint[];
    const goals = (profile.goals || []) as Goal[];
    const quickIntake = (session.quick_intake || {}) as QuickIntake;

    // Calculate module scores based on pain points and goals
    const moduleScores: Record<string, { score: number; painPoints: string[]; goals: string[] }> = {};

    // Score from pain points
    for (const pp of painPoints) {
      const weight = pp.severity === 'high' ? 3 : pp.severity === 'medium' ? 2 : 1;
      for (const moduleId of pp.related_modules) {
        if (!moduleScores[moduleId]) {
          moduleScores[moduleId] = { score: 0, painPoints: [], goals: [] };
        }
        moduleScores[moduleId].score += weight;
        moduleScores[moduleId].painPoints.push(pp.id);
      }
    }

    // Score from goals
    for (const g of goals) {
      const weight = g.priority === 'high' ? 3 : g.priority === 'medium' ? 2 : 1;
      for (const moduleId of g.related_modules) {
        if (!moduleScores[moduleId]) {
          moduleScores[moduleId] = { score: 0, painPoints: [], goals: [] };
        }
        moduleScores[moduleId].score += weight;
        moduleScores[moduleId].goals.push(g.id);
      }
    }

    // Add base recommendations based on org type
    const orgTypeDefaults: Record<string, ModuleId[]> = {
      foundation: ['impact_tracking', 'grant_management', 'reporting'],
      daf: ['impact_tracking', 'tax_optimization', 'reporting'],
      nonprofit: ['impact_tracking', 'donor_management', 'reporting'],
      impact_investor: ['impact_tracking', 'analytics', 'reporting'],
    };

    const legacyOrgType = quickIntake.org_type as string | undefined;
    const defaults = legacyOrgType ? orgTypeDefaults[legacyOrgType] : [];
    for (const moduleId of defaults) {
      if (!moduleScores[moduleId]) {
        moduleScores[moduleId] = { score: 1, painPoints: [], goals: [] };
      } else {
        moduleScores[moduleId].score += 1;
      }
    }

    // Generate recommendations
    const recommendations: ModuleRecommendation[] = [];
    const excluded: ExcludedModule[] = [];

    const maxScore = Math.max(...Object.values(moduleScores).map(m => m.score), 1);

    for (const [moduleId, data] of Object.entries(moduleScores)) {
      const moduleDef = MODULE_REGISTRY[moduleId as ModuleId];
      if (!moduleDef || moduleDef.isCore) continue;

      const confidence = data.score / maxScore;

      if (confidence >= 0.3) {
        // Build reasoning
        const reasons: string[] = [];
        if (data.painPoints.length > 0) {
          const ppDescriptions = painPoints
            .filter(pp => data.painPoints.includes(pp.id))
            .map(pp => pp.description);
          if (ppDescriptions.length > 0) {
            reasons.push(`Addresses: ${ppDescriptions.join('; ')}`);
          }
        }
        if (data.goals.length > 0) {
          const goalDescriptions = goals
            .filter(g => data.goals.includes(g.id))
            .map(g => g.goal);
          if (goalDescriptions.length > 0) {
            reasons.push(`Helps achieve: ${goalDescriptions.join('; ')}`);
          }
        }
        if (reasons.length === 0 && defaults.includes(moduleId as ModuleId)) {
          reasons.push(`Recommended for ${quickIntake.org_type || 'your organization type'}`);
        }

        recommendations.push({
          module_id: moduleId as ModuleId,
          confidence,
          reasoning: reasons.join('. ') || moduleDef.description,
          pain_points_addressed: data.painPoints,
          goals_addressed: data.goals,
        });
      }
    }

    // Sort by confidence
    recommendations.sort((a, b) => b.confidence - a.confidence);

    // Identify excluded modules with reasons
    const allModuleIds = Object.keys(MODULE_REGISTRY) as ModuleId[];
    const recommendedIds = new Set(recommendations.map(r => r.module_id));

    for (const moduleId of allModuleIds) {
      const modDef = MODULE_REGISTRY[moduleId];
      if (modDef.isCore || recommendedIds.has(moduleId)) continue;

      let reason = 'No matching needs identified';
      if (moduleId === 'tax_optimization' && legacyOrgType !== 'daf') {
        reason = 'Best suited for donor-advised fund sponsors';
      } else if (moduleId === 'grant_management' && quickIntake.org_type === 'nonprofit') {
        reason = 'More relevant for grantmakers than grant recipients';
      } else if (moduleId === 'analytics' && (moduleScores[moduleId]?.score || 0) < 2) {
        reason = 'Advanced analytics may not be needed initially';
      }

      excluded.push({ module_id: moduleId, reason });
    }

    // Save recommendations
    await this.supabase
      .from('onboarding_recommendations')
      .upsert({
        session_id: sessionId,
        recommended_modules: recommendations,
        excluded_modules: excluded,
        generated_at: new Date().toISOString(),
      }, {
        onConflict: 'session_id',
      });

    return { recommendations, excluded };
  }

  /**
   * Update session data with extractions
   */
  private async updateSessionData(
    sessionId: string,
    extractions: {
      pain_points: PainPoint[];
      goals: Goal[];
      workflows: Record<string, any>;
      team_context: Record<string, any>;
      updated_state?: ConversationState;
    }
  ) {
    // Get current profile
    const { data: profile } = await this.supabase
      .from('onboarding_profiles')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (!profile) return;

    const updates: Record<string, any> = {};

    // Merge pain points
    if (extractions.pain_points.length > 0) {
      const existing = (profile.pain_points || []) as PainPoint[];
      updates.pain_points = [...existing, ...extractions.pain_points];
    }

    // Merge goals
    if (extractions.goals.length > 0) {
      const existing = (profile.goals || []) as Goal[];
      updates.goals = [...existing, ...extractions.goals];
    }

    // Merge workflows
    if (Object.keys(extractions.workflows).length > 0) {
      const existing = (profile.workflows || {}) as Record<string, any>;
      updates.workflows = { ...existing, ...extractions.workflows };
    }

    // Merge team context
    if (Object.keys(extractions.team_context).length > 0) {
      const existing = (profile.team_context || {}) as Record<string, any>;
      updates.team_context = { ...existing, ...extractions.team_context };
    }

    if (Object.keys(updates).length > 0) {
      await this.supabase
        .from('onboarding_profiles')
        .update(updates)
        .eq('session_id', sessionId);
    }

    // Update conversation state
    if (extractions.updated_state) {
      await this.supabase
        .from('onboarding_sessions')
        .update({
          conversation_state: extractions.updated_state,
        })
        .eq('id', sessionId);
    }

    // Update analytics
    await this.supabase
      .from('onboarding_analytics')
      .update({
        pain_points_extracted: (profile.pain_points?.length || 0) + extractions.pain_points.length,
        goals_extracted: (profile.goals?.length || 0) + extractions.goals.length,
        message_count: extractions.updated_state?.message_count || 0,
      })
      .eq('session_id', sessionId);
  }

  /**
   * Get the first onboarding message to start the conversation
   */
  static getWelcomeMessage(quickIntake: QuickIntake): string {
    const orgName = quickIntake.org_name || 'your organization';
    const orgTypeGreeting: Record<OrgType, string> = {
      private_foundation: `managing grants at ${orgName}`,
      family_office: `coordinating investments and philanthropy at ${orgName}`,
      daf_sponsor: `supporting donors and grantmaking at ${orgName}`,
      community_foundation: `serving donors and local organizations through ${orgName}`,
      nonprofit: `running ${orgName}`,
      corporation: `running the giving program at ${orgName}`,
      individual: `organizing philanthropy through ${orgName}`,
    };

    const greeting = quickIntake.org_type
      ? orgTypeGreeting[quickIntake.org_type]
      : `managing philanthropy at ${orgName}`;

    return `Let’s shape the first version of ${orgName}'s operating space.

For ${greeting}, what would make this workspace indispensable over the next 90 days?`;
  }
}
