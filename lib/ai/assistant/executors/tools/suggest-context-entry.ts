import type { AssistantToolExecutor } from '../../executor-types';
import { InputValidator } from '../../helpers';
import {
  ORG_AI_CONTEXT_KEY_PATTERN,
  ORG_AI_CONTEXT_TYPES,
  normalizeContextKey,
} from '@/lib/organizations/ai-context';

export const executeSuggestContextEntry: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId, userId } = runtime;
  {
    InputValidator.validateEnum(
      args.context_type,
      'context_type',
      ORG_AI_CONTEXT_TYPES,
    );
    InputValidator.validateRequired(args.context_value, 'context_value');
    InputValidator.validateRequired(args.reasoning, 'reasoning');
    InputValidator.validateString(args.context_key, 'context_key', {
      maxLength: 80,
    });
    InputValidator.validateString(args.context_value, 'context_value', {
      maxLength: 4000,
    });
    InputValidator.validateString(args.reasoning, 'reasoning', {
      maxLength: 1000,
    });

    const contextKey = ORG_AI_CONTEXT_KEY_PATTERN.test(
      String(args.context_key ?? ''),
    )
      ? String(args.context_key)
      : normalizeContextKey(String(args.context_key ?? 'context_entry'));

    const { data: portfolio, error: portfolioErr } = await supabase
      .from('portfolios')
      .select('org_id')
      .eq('id', portfolioId)
      .single();
    if (portfolioErr || !portfolio?.org_id) {
      throw new Error('Unable to resolve portfolio organization');
    }

    const { data, error } = await supabase
      .from('org_ai_context')
      .upsert(
        {
          org_id: portfolio.org_id,
          context_type: args.context_type,
          context_key: contextKey,
          context_value: String(args.context_value).trim(),
          source: 'ai_suggestion',
          is_active: true,
          created_by: userId,
        },
        { onConflict: 'org_id,context_key' },
      )
      .select('id, context_key, context_type, context_value')
      .single();
    if (error) throw new Error(error.message);

    return {
      action: null,
      output: {
        success: true,
        context_entry: data,
        reasoning: args.reasoning,
        message:
          'Organization context saved and will be used in future assistant sessions.',
      },
    };
  }
};
