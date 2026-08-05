import { executeGetCustomFields } from '../tools/get-custom-fields';
import { executeSearchCustomFieldValues } from '../tools/search-custom-field-values';
import { executeSuggestContextEntry } from '../tools/suggest-context-entry';
import type { AssistantToolExecutorRegistry } from '../../executor-types';

export const CUSTOM_FIELDS_EXECUTORS = {
  get_custom_fields: executeGetCustomFields,
  search_custom_field_values: executeSearchCustomFieldValues,
  suggest_context_entry: executeSuggestContextEntry,
} satisfies AssistantToolExecutorRegistry;
