/**
 * AI Models Configuration
 *
 * Defines which AI models to use for different tasks.
 * Environment variables can override defaults.
 */

export const AI_MODELS = {
  /**
   * Model for general assistant interactions
   * @default 'claude-opus-5'
   * @env AI_MODEL_ASSISTANT
   */
  assistant: process.env.AI_MODEL_ASSISTANT ?? 'claude-opus-5',

  /**
   * Model for scaffold planning phase
   * @default 'claude-opus-5'
   * @env AI_MODEL_SCAFFOLD_PLAN
   */
  scaffoldPlan: process.env.AI_MODEL_SCAFFOLD_PLAN ?? 'claude-opus-5',

  /**
   * Model for scaffold build phase
   * @default 'claude-sonnet-5'
   * @env AI_MODEL_SCAFFOLD_BUILD
   */
  scaffoldBuild: process.env.AI_MODEL_SCAFFOLD_BUILD ?? 'claude-sonnet-5',

  /**
   * Model for scaffold review phase
   * @default 'claude-opus-5'
   * @env AI_MODEL_SCAFFOLD_REVIEW
   */
  scaffoldReview: process.env.AI_MODEL_SCAFFOLD_REVIEW ?? 'claude-opus-5',
} as const;
