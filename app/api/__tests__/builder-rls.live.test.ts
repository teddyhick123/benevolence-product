// @vitest-environment node
//
// Live RLS/behavior test for the canonical Builder durable-orchestration schema
// (db/migrations/0025_builder.sql). This test talks to a real Supabase instance
// (local `supabase start` or a disposable project) and is skipped by default —
// it is NOT run in CI. To run locally:
//
//   BUILDER_DB_TESTS=1 npx vitest run app/api/__tests__/builder-rls.live.test.ts
//
// Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE, and
// NEXT_PUBLIC_SUPABASE_ANON_KEY in the environment, with migrations 0001-0025
// (at minimum) applied.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const RUN_LIVE = !!process.env.BUILDER_DB_TESTS;

describe.skipIf(!RUN_LIVE)('builder schema: live RLS + behavior', () => {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE!;
  const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  let svc: SupabaseClient;

  // Org A
  let orgA: string;
  let adminA: { id: string; email: string; password: string };
  let memberA: { id: string; email: string; password: string };
  let proposalA: string;
  let revisionA: string;
  let attemptA: string;

  // Org B
  let orgB: string;
  let adminB: { id: string; email: string; password: string };
  let proposalB: string;
  let revisionB: string;
  let attemptB: string;

  // Scaffold proposal used to exercise builder_claim_code_run
  let scaffoldProposalId: string;

  async function createOrgAdmin(orgName: string): Promise<{ orgId: string; admin: { id: string; email: string; password: string } }> {
    const email = `builder-rls-${randomUUID()}@example.com`;
    const password = `Pw!${randomUUID()}`;
    const { data: userRes, error: userErr } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (userErr || !userRes.user) throw userErr ?? new Error('user create failed');

    const { data: org, error: orgErr } = await svc
      .from('organizations')
      .insert({ name: orgName })
      .select('id')
      .single();
    if (orgErr || !org) throw orgErr ?? new Error('org create failed');

    const { error: memberErr } = await svc.from('organization_members').insert({
      org_id: org.id,
      user_id: userRes.user.id,
      role: 'admin',
      accepted_at: new Date().toISOString(),
    });
    if (memberErr) throw memberErr;

    return { orgId: org.id, admin: { id: userRes.user.id, email, password } };
  }

  async function createOrgMember(orgId: string): Promise<{ id: string; email: string; password: string }> {
    const email = `builder-rls-member-${randomUUID()}@example.com`;
    const password = `Pw!${randomUUID()}`;
    const { data: userRes, error: userErr } = await svc.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (userErr || !userRes.user) throw userErr ?? new Error('user create failed');

    const { error: memberErr } = await svc.from('organization_members').insert({
      org_id: orgId,
      user_id: userRes.user.id,
      role: 'member',
      accepted_at: new Date().toISOString(),
    });
    if (memberErr) throw memberErr;

    return { id: userRes.user.id, email, password };
  }

  async function userClientFor(user: { email: string; password: string }): Promise<SupabaseClient> {
    const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
    const { error } = await client.auth.signInWithPassword({ email: user.email, password: user.password });
    if (error) throw error;
    return client;
  }

  async function seedOrgProposal(orgId: string, actorId: string) {
    const { data: proposal, error: proposalErr } = await svc
      .from('builder_proposals')
      .insert({
        org_id: orgId,
        requested_by: actorId,
        request_text: 'Add a widget',
        proposal_type: 'code',
        code_state: 'generating',
      })
      .select('id')
      .single();
    if (proposalErr || !proposal) throw proposalErr ?? new Error('proposal create failed');

    const { data: revision, error: revisionErr } = await svc
      .from('builder_proposal_revisions')
      .insert({
        proposal_id: proposal.id,
        revision_number: 1,
        kind: 'generic_submission',
        artifact_prefix: `${orgId}/${proposal.id}/rev1`,
        created_by: actorId,
      })
      .select('id')
      .single();
    if (revisionErr || !revision) throw revisionErr ?? new Error('revision create failed');

    const { data: attempt, error: attemptErr } = await svc
      .from('builder_review_attempts')
      .insert({
        proposal_id: proposal.id,
        revision_id: revision.id,
        attempt_number: 1,
        trigger: 'initial',
        policy_version: 'v1',
      })
      .select('id')
      .single();
    if (attemptErr || !attempt) throw attemptErr ?? new Error('attempt create failed');

    const { error: findingErr } = await svc.from('builder_review_findings').insert({
      review_attempt_id: attempt.id,
      reviewer_kind: 'automated_review',
      severity: 'warning',
      evidence: 'unused variable',
    });
    if (findingErr) throw findingErr;

    const { error: deliveryErr } = await svc.from('builder_delivery_records').insert({
      proposal_id: proposal.id,
      revision_id: revision.id,
      provider: 'github',
      status: 'pr_open',
      provider_event_id: `evt-${randomUUID()}`,
    });
    if (deliveryErr) throw deliveryErr;

    return { proposalId: proposal.id, revisionId: revision.id, attemptId: attempt.id };
  }

  beforeAll(async () => {
    svc = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    const a = await createOrgAdmin('Builder RLS Org A');
    orgA = a.orgId;
    adminA = a.admin;
    memberA = await createOrgMember(orgA);

    const b = await createOrgAdmin('Builder RLS Org B');
    orgB = b.orgId;
    adminB = b.admin;

    const seededA = await seedOrgProposal(orgA, adminA.id);
    proposalA = seededA.proposalId;
    revisionA = seededA.revisionId;
    attemptA = seededA.attemptId;

    const seededB = await seedOrgProposal(orgB, adminB.id);
    proposalB = seededB.proposalId;
    revisionB = seededB.revisionId;
    attemptB = seededB.attemptId;

    const { data: scaffoldProposal, error: scaffoldErr } = await svc
      .from('builder_proposals')
      .insert({
        org_id: orgA,
        requested_by: adminA.id,
        request_text: 'Scaffold a new module',
        proposal_type: 'code',
        code_state: 'plan_ready',
        plan_content: { steps: ['create table', 'create route'] },
      })
      .select('id')
      .single();
    if (scaffoldErr || !scaffoldProposal) throw scaffoldErr ?? new Error('scaffold proposal create failed');
    scaffoldProposalId = scaffoldProposal.id;
  });

  afterAll(async () => {
    // Best-effort cleanup; child rows cascade from builder_proposals via FK.
    for (const orgId of [orgA, orgB].filter(Boolean)) {
      await svc.from('organizations').delete().eq('id', orgId);
    }
    for (const user of [adminA, memberA, adminB].filter(Boolean)) {
      await svc.auth.admin.deleteUser(user.id).catch(() => {});
    }
  });

  it('org-A admin reads own orchestration rows and gets zero rows for org-B', async () => {
    const clientA = await userClientFor(adminA);

    const { data: ownRevisions, error: ownRevErr } = await clientA
      .from('builder_proposal_revisions')
      .select('id')
      .eq('id', revisionA);
    expect(ownRevErr).toBeNull();
    expect(ownRevisions).toHaveLength(1);

    const { data: otherRevisions, error: otherRevErr } = await clientA
      .from('builder_proposal_revisions')
      .select('id')
      .eq('id', revisionB);
    expect(otherRevErr).toBeNull();
    expect(otherRevisions).toHaveLength(0);

    const { data: ownAttempts } = await clientA
      .from('builder_review_attempts')
      .select('id')
      .eq('id', attemptA);
    expect(ownAttempts).toHaveLength(1);

    const { data: otherAttempts } = await clientA
      .from('builder_review_attempts')
      .select('id')
      .eq('id', attemptB);
    expect(otherAttempts).toHaveLength(0);

    const { data: ownFindings } = await clientA
      .from('builder_review_findings')
      .select('id')
      .eq('review_attempt_id', attemptA);
    expect(ownFindings!.length).toBeGreaterThan(0);

    const { data: otherFindings } = await clientA
      .from('builder_review_findings')
      .select('id')
      .eq('review_attempt_id', attemptB);
    expect(otherFindings).toHaveLength(0);

    const { data: ownDelivery } = await clientA
      .from('builder_delivery_records')
      .select('id')
      .eq('proposal_id', proposalA);
    expect(ownDelivery!.length).toBeGreaterThan(0);

    const { data: otherDelivery } = await clientA
      .from('builder_delivery_records')
      .select('id')
      .eq('proposal_id', proposalB);
    expect(otherDelivery).toHaveLength(0);
  });

  it('authenticated non-admin gets zero rows from orchestration tables', async () => {
    const clientMember = await userClientFor(memberA);

    const { data: revisions, error: revErr } = await clientMember
      .from('builder_proposal_revisions')
      .select('id')
      .eq('id', revisionA);
    expect(revErr).toBeNull();
    expect(revisions).toHaveLength(0);

    const { data: attempts } = await clientMember
      .from('builder_review_attempts')
      .select('id')
      .eq('id', attemptA);
    expect(attempts).toHaveLength(0);

    const { data: findings } = await clientMember
      .from('builder_review_findings')
      .select('id')
      .eq('review_attempt_id', attemptA);
    expect(findings).toHaveLength(0);

    const { data: delivery } = await clientMember
      .from('builder_delivery_records')
      .select('id')
      .eq('proposal_id', proposalA);
    expect(delivery).toHaveLength(0);
  });

  it('authenticated INSERT into orchestration tables fails for admins and members alike', async () => {
    const clientA = await userClientFor(adminA);

    const { error: revInsertErr } = await clientA.from('builder_proposal_revisions').insert({
      proposal_id: proposalA,
      revision_number: 999,
      kind: 'repair',
      artifact_prefix: `${orgA}/${proposalA}/hack`,
    });
    expect(revInsertErr).not.toBeNull();

    const { error: attemptInsertErr } = await clientA.from('builder_review_attempts').insert({
      proposal_id: proposalA,
      revision_id: revisionA,
      attempt_number: 999,
      trigger: 'retry',
      policy_version: 'v1',
    });
    expect(attemptInsertErr).not.toBeNull();

    const { error: findingInsertErr } = await clientA.from('builder_review_findings').insert({
      review_attempt_id: attemptA,
      reviewer_kind: 'system',
      severity: 'info',
      evidence: 'should not be allowed',
    });
    expect(findingInsertErr).not.toBeNull();

    const { error: deliveryInsertErr } = await clientA.from('builder_delivery_records').insert({
      proposal_id: proposalA,
      revision_id: revisionA,
      provider: 'github',
      status: 'pr_open',
      provider_event_id: `evt-${randomUUID()}`,
    });
    expect(deliveryInsertErr).not.toBeNull();
  });

  it('service client can UPDATE a revision with no attempts, but a manifest_hash change after an attempt exists raises builder_revision_immutable', async () => {
    // Fresh revision with no attempts yet — mutation allowed.
    const { data: freshRevision, error: freshErr } = await svc
      .from('builder_proposal_revisions')
      .insert({
        proposal_id: proposalA,
        revision_number: 2,
        kind: 'repair',
        artifact_prefix: `${orgA}/${proposalA}/rev2`,
        created_by: adminA.id,
      })
      .select('id')
      .single();
    expect(freshErr).toBeNull();
    expect(freshRevision).toBeTruthy();

    const { error: freeUpdateErr } = await svc
      .from('builder_proposal_revisions')
      .update({ manifest_hash: 'abc123' })
      .eq('id', freshRevision!.id);
    expect(freeUpdateErr).toBeNull();

    // Now attach a review attempt, which freezes identity fields.
    const { error: attemptErr } = await svc.from('builder_review_attempts').insert({
      proposal_id: proposalA,
      revision_id: freshRevision!.id,
      attempt_number: 1,
      trigger: 'initial',
      policy_version: 'v1',
    });
    expect(attemptErr).toBeNull();

    const { error: lockedUpdateErr } = await svc
      .from('builder_proposal_revisions')
      .update({ manifest_hash: 'changed-after-attempt' })
      .eq('id', freshRevision!.id);
    expect(lockedUpdateErr).not.toBeNull();
    expect(lockedUpdateErr?.message).toMatch(/builder_revision_immutable/);
  });

  it('base_commit_sha may be stamped NULL->value after an attempt exists, but re-stamping a non-null base_commit_sha raises builder_revision_immutable', async () => {
    // Fresh revision with a NULL base_commit_sha.
    const { data: freshRevision, error: freshErr } = await svc
      .from('builder_proposal_revisions')
      .insert({
        proposal_id: proposalA,
        revision_number: 3,
        kind: 'repair',
        artifact_prefix: `${orgA}/${proposalA}/rev3`,
        created_by: adminA.id,
      })
      .select('id')
      .single();
    expect(freshErr).toBeNull();
    expect(freshRevision).toBeTruthy();

    // Attach a review attempt, which freezes identity fields.
    const { error: attemptErr } = await svc.from('builder_review_attempts').insert({
      proposal_id: proposalA,
      revision_id: freshRevision!.id,
      attempt_number: 1,
      trigger: 'initial',
      policy_version: 'v1',
    });
    expect(attemptErr).toBeNull();

    // (a) Stamping base_commit_sha from NULL to a value AFTER the attempt exists
    //     must SUCCEED (the apply route's Step 6 recovery path).
    const { error: stampErr } = await svc
      .from('builder_proposal_revisions')
      .update({ base_commit_sha: 'a'.repeat(40) })
      .eq('id', freshRevision!.id);
    expect(stampErr).toBeNull();

    // (b) Changing an ALREADY-non-null base_commit_sha to a different value must
    //     still RAISE (immutability preserved once stamped).
    const { error: reStampErr } = await svc
      .from('builder_proposal_revisions')
      .update({ base_commit_sha: 'b'.repeat(40) })
      .eq('id', freshRevision!.id);
    expect(reStampErr).not.toBeNull();
    expect(reStampErr?.message).toMatch(/builder_revision_immutable/);
  });

  it('builder_claim_code_run creates revision 1 and sets code_state=queued for a plan_ready scaffold, then raises builder_claim_conflict on immediate re-claim', async () => {
    const { data: claimed, error: claimErr } = await svc.rpc('builder_claim_code_run', {
      p_proposal_id: scaffoldProposalId,
      p_org_id: orgA,
      p_actor: adminA.id,
    });
    expect(claimErr).toBeNull();
    expect(claimed).toBeTruthy();
    const row = Array.isArray(claimed) ? claimed[0] : claimed;
    expect(row.reused).toBe(false);
    expect(row.revision_id).toBeTruthy();

    const { data: proposalAfter, error: proposalAfterErr } = await svc
      .from('builder_proposals')
      .select('code_state, current_revision_id')
      .eq('id', scaffoldProposalId)
      .single();
    expect(proposalAfterErr).toBeNull();
    expect(proposalAfter?.code_state).toBe('queued');
    expect(proposalAfter?.current_revision_id).toBe(row.revision_id);

    const { data: revision, error: revisionErr } = await svc
      .from('builder_proposal_revisions')
      .select('revision_number')
      .eq('id', row.revision_id)
      .single();
    expect(revisionErr).toBeNull();
    expect(revision?.revision_number).toBe(1);

    const { error: secondClaimErr } = await svc.rpc('builder_claim_code_run', {
      p_proposal_id: scaffoldProposalId,
      p_org_id: orgA,
      p_actor: adminA.id,
    });
    expect(secondClaimErr).not.toBeNull();
    expect(secondClaimErr?.message).toMatch(/builder_claim_conflict/);
  });
});
