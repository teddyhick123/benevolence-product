import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

const source = readFileSync('app/login/page.tsx', 'utf8');

describe('login connection resilience', () => {
  it('renders the form when the initial session check fails', () => {
    expect(source).toContain(".catch((authError) => {");
    expect(source).toContain('setSessionChecked(true);');
    expect(source).toContain('We could not check your sign-in session.');
  });

  it('turns auth fetch failures into actionable messages', () => {
    expect(source).toContain("error.message === 'Failed to fetch'");
    expect(source).toContain('We could not connect to secure sign-in. Check your connection and try again.');
    expect(source).toContain('catch (authError)');
  });
});
