// lib/ai/prompt-guard.ts
// Detects prompt injection attempts in user-supplied messages.

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions?/i,
  /disregard\s+(all\s+)?previous\s+instructions?/i,
  /forget\s+(all\s+)?previous\s+instructions?/i,
  /you\s+are\s+now\s+(a|an)\s+/i,
  /act\s+as\s+(a|an)\s+/i,
  /pretend\s+(to\s+be|you\s+are)\s+/i,
  /\bsystem\s*:\s*/i,
  /\bassistant\s*:\s*/i,
  /\bhuman\s*:\s*/i,
  /override\s+(your\s+)?(system\s+)?prompt/i,
  /jailbreak/i,
  /DAN\s+mode/i,
];

/**
 * Returns true if the message contains prompt injection patterns.
 * Does NOT throw — callers decide how to respond.
 */
export function containsInjection(message: string): boolean {
  return INJECTION_PATTERNS.some(re => re.test(message));
}
