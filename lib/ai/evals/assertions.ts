import type { Assertion, Observed } from '@/lib/ai/evals/types';
import type { AIContentBlock } from '@/lib/ai/types';

function toolCalls(observed: Observed): Array<Extract<AIContentBlock, { type: 'tool_use' }>> {
  return (observed.response?.content ?? [])
    .filter((block): block is Extract<AIContentBlock, { type: 'tool_use' }> => block.type === 'tool_use');
}

/** Whitespace tokenisation. Deliberately provider-neutral and approximate. */
function tokenCount(text: string): number {
  return text.trim() === '' ? 0 : text.trim().split(/\s+/).length;
}

function collectStrings(value: unknown, into: string[] = []): string[] {
  if (typeof value === 'string') into.push(value);
  else if (Array.isArray(value)) value.forEach(item => collectStrings(item, into));
  else if (value && typeof value === 'object') Object.values(value).forEach(item => collectStrings(item, into));
  return into;
}

export function callsTool(name: string): Assertion {
  return {
    id: `calls-tool:${name}`,
    check(observed) {
      const calls = toolCalls(observed);
      if (calls.length === 0) return { passed: false, detail: 'Model produced no tool call' };
      const matched = calls.some(call => call.name === name);
      return matched
        ? { passed: true, detail: `Called ${name}` }
        : { passed: false, detail: `Called ${calls.map(c => c.name).join(', ')} instead of ${name}` };
    },
  };
}

export function callsNoToolNamed(name: string): Assertion {
  return {
    id: `calls-no-tool:${name}`,
    check(observed) {
      const called = toolCalls(observed).some(call => call.name === name);
      return called
        ? { passed: false, detail: `Model called ${name}, which it was not asked to call` }
        : { passed: true, detail: `Did not call ${name}` };
    },
  };
}

export function callsOnlyKnownTools(names: readonly string[]): Assertion {
  return {
    id: 'calls-only-known-tools',
    check(observed) {
      const unknown = toolCalls(observed).map(call => call.name).filter(name => !names.includes(name));
      return unknown.length === 0
        ? { passed: true, detail: 'All tool calls name declared tools' }
        : { passed: false, detail: `Hallucinated tool names: ${unknown.join(', ')}` };
    },
  };
}

export function containsAll(values: readonly string[]): Assertion {
  return {
    id: 'contains-all',
    check(observed) {
      const missing = values.filter(value => !observed.text.includes(value));
      return missing.length === 0
        ? { passed: true, detail: 'All required values present' }
        : { passed: false, detail: `Missing: ${missing.join(', ')}` };
    },
  };
}

const PLACEHOLDER = /\[(insert|name|amount|date|todo|placeholder)[^\]]*\]|\bTODO\b|\bXXX+\b|\{\{[^}]+\}\}/i;

export function omitsPlaceholders(): Assertion {
  return {
    id: 'omits-placeholders',
    check(observed) {
      const match = PLACEHOLDER.exec(observed.text);
      return match
        ? { passed: false, detail: `Unfilled placeholder: ${match[0]}` }
        : { passed: true, detail: 'No placeholder text' };
    },
  };
}

/**
 * Every string value in the structured output must appear in the source
 * document. This is how hallucination is measured without a judge model.
 */
export function groundedIn(): Assertion {
  return {
    id: 'grounded-in-source',
    check(observed) {
      if (!observed.sourceText) return { passed: false, detail: 'Case supplied no source text' };
      const source = observed.sourceText.toLowerCase();
      const ungrounded = collectStrings(observed.json)
        .filter(value => value.trim().length > 3)
        .filter(value => !source.includes(value.toLowerCase()));
      return ungrounded.length === 0
        ? { passed: true, detail: 'Every extracted value appears in the source' }
        : { passed: false, detail: `Not present in source: ${ungrounded.join(', ')}` };
    },
  };
}

export function withinTokens(max: number): Assertion {
  return {
    id: `within-tokens:${max}`,
    check(observed) {
      const count = tokenCount(observed.text);
      return count <= max
        ? { passed: true, detail: `${count} tokens` }
        : { passed: false, detail: `${count} tokens exceeds ${max}` };
    },
  };
}

export function respondsWithText(): Assertion {
  return {
    id: 'responds-with-text',
    check(observed) {
      return observed.text.trim().length > 0
        ? { passed: true, detail: 'Returned text' }
        : { passed: false, detail: 'Returned no text' };
    },
  };
}

export function streamsProgressively(): Assertion {
  return {
    id: 'streams-progressively',
    check(observed) {
      const deltas = (observed.chunks ?? []).filter(chunk => chunk.type === 'text_delta').length;
      return deltas > 1
        ? { passed: true, detail: `${deltas} text deltas` }
        : { passed: false, detail: `${deltas} text delta(s) — response was not streamed incrementally` };
    },
  };
}

/**
 * Minimal structural validation: required keys present and primitive types
 * match. Full JSON Schema is not warranted — the schemas here are the ones
 * this repository authors, not arbitrary user input.
 */
export function jsonMatchesSchema(schema: Record<string, unknown>): Assertion {
  return {
    id: 'json-matches-schema',
    check(observed) {
      const value = observed.json;
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return { passed: false, detail: 'Output is not a JSON object' };
      }
      const record = value as Record<string, unknown>;
      const required = (schema.required as string[] | undefined) ?? [];
      const missing = required.filter(key => record[key] === undefined || record[key] === null);
      if (missing.length > 0) return { passed: false, detail: `Missing required fields: ${missing.join(', ')}` };

      const properties = (schema.properties as Record<string, { type?: string }> | undefined) ?? {};
      const wrongType = Object.entries(properties)
        .filter(([key, definition]) => {
          if (record[key] === undefined || !definition.type) return false;
          const actual = Array.isArray(record[key]) ? 'array' : typeof record[key];
          return definition.type === 'integer' ? actual !== 'number' : actual !== definition.type;
        })
        .map(([key]) => key);
      return wrongType.length === 0
        ? { passed: true, detail: 'Output matches schema' }
        : { passed: false, detail: `Wrong type for: ${wrongType.join(', ')}` };
    },
  };
}
