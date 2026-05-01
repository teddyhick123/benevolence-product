/**
 * AI Models Configuration
 *
 * Defines which AI models to use for different tasks.
 * Environment variables can override defaults.
 */

export const AI_MODELS = {
  /**
   * Model for general assistant interactions
   * @default 'claude-sonnet-4-6'
   * @env AI_MODEL_ASSISTANT
   */
  assistant: process.env.AI_MODEL_ASSISTANT ?? 'claude-sonnet-4-6',

  /**
   * Model for scaffold planning phase
   * @default 'claude-opus-4-7'
   * @env AI_MODEL_SCAFFOLD_PLAN
   */
  scaffoldPlan: process.env.AI_MODEL_SCAFFOLD_PLAN ?? 'claude-opus-4-7',

  /**
   * Model for scaffold build phase
   * @default 'claude-sonnet-4-6'
   * @env AI_MODEL_SCAFFOLD_BUILD
   */
  scaffoldBuild: process.env.AI_MODEL_SCAFFOLD_BUILD ?? 'claude-sonnet-4-6',

  /**
   * Model for scaffold review phase
   * @default 'claude-opus-4-7'
   * @env AI_MODEL_SCAFFOLD_REVIEW
   */
  scaffoldReview: process.env.AI_MODEL_SCAFFOLD_REVIEW ?? 'claude-opus-4-7',
} as const;
