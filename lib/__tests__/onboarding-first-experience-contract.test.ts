import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';

function source(path: string) {
  return readFileSync(path, 'utf8');
}

describe('Foundation Setup first experience', () => {
  it('keeps the newest user message out of prior model history', () => {
    const repository = source('lib/api/repositories/onboarding.ts');
    expect(repository).toContain('messages.slice(0, -1)');
    expect(repository).toContain('would append it a second time');
  });

  it('uses a bounded multi-turn tool loop instead of the repeated generic fallback', () => {
    const assistant = source('lib/onboarding-assistant.ts');
    expect(assistant).toContain('const MAX_TOOL_TURNS = 4');
    expect(assistant).toContain('for (let turn = 0; turn < MAX_TOOL_TURNS; turn++)');
    expect(assistant).not.toContain("I've noted that information. Could you tell me more about your day-to-day work?");
    expect(assistant).toContain("Never ask the same broad question twice");
  });

  it('uses canonical organization types and an owner-safe provisioner', () => {
    const assistant = source('lib/onboarding-assistant.ts');
    const flow = source('components/onboarding/OnboardingFlow.tsx');
    const provisionRoute = source('app/api/onboarding/provision/route.ts');
    const provisioner = source('lib/api/repositories/onboarding-provisioning.ts');

    expect(assistant).toContain("private_foundation: 'private foundation managing grants'");
    expect(flow).toContain("fetch('/api/onboarding/provision'");
    expect(flow).toContain('module_ids: selectedModules');
    expect(provisioner).toContain('p_owner_user_id: userId');
    expect(provisionRoute).toContain('module_ids?: string[]');
  });

  it('shows a live Foundation Blueprint instead of an opaque chat-progress sidebar', () => {
    const chat = source('components/onboarding/OnboardingChat.tsx');
    const blueprint = source('components/onboarding/FoundationBlueprint.tsx');

    expect(chat).toContain('FoundationBlueprint');
    expect(chat).toContain('Foundation Setup');
    expect(chat).toContain('initialBlueprint');
    expect(blueprint).toContain('Foundation Blueprint');
    expect(blueprint).toContain('Your dashboard priorities');
  });

  it('hydrates the blueprint from the persisted onboarding profile when a session resumes', () => {
    const flow = source('components/onboarding/OnboardingFlow.tsx');
    const page = source('app/onboarding/page.tsx');
    expect(flow).toContain('onboarding_profiles');
    expect(flow).toContain('blueprintFromSession');
    expect(flow).toContain('initialBlueprint={blueprint}');
    expect(page).toContain('onboarding_profiles: existingSession.onboarding_profiles');
  });

  it('keeps partial provisioning visible and retryable', () => {
    const flow = source('components/onboarding/OnboardingFlow.tsx');
    const recommendations = source('components/onboarding/ModuleRecommendations.tsx');
    const provisionRoute = source('app/api/onboarding/provision/route.ts');
    const provisioner = source('lib/api/repositories/onboarding-provisioning.ts');

    expect(flow).toContain('result.module_errors');
    expect(flow).toContain('result.setup_errors');
    expect(flow).toContain('setProvisionError');
    expect(recommendations).toContain('Retry setup');
    expect(recommendations).toContain('FoundationSetupPreview');
    expect(recommendations).toContain('role="alert"');
    expect(provisioner).toContain("status: 'recommendations'");
    expect(provisioner).toContain('moduleErrors.length > 0 || setupErrors.length > 0');
    expect(provisioner).toContain('upsert(automationRows');
    expect(provisioner).toContain('completed_successfully: !provisioningHasErrors');
    expect(provisionRoute).toContain("setup_errors: result.setupErrors.length > 0");
  });

  it('keeps one canonical onboarding route', () => {
    const welcome = source('app/welcome/page.tsx');
    const header = source('components/dashboard/ConditionalHeader.tsx');
    expect(welcome).toContain("redirect('/onboarding')");
    expect(welcome).not.toContain('SetupClient');
    expect(header).toContain('"/onboarding"');
  });
});
