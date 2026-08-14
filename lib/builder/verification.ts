// lib/builder/verification.ts
//
// Builder Increment 3 — isolated deterministic verifier.
//
// Persistence glue: runs a VerificationRunner, uploads each check's
// capped/redacted log as a durable artifact, and idempotently upserts
// builder_verification_runs rows (UNIQUE(review_attempt_id, check_key) —
// migration 0025). This module performs no check-matrix or subprocess
// logic itself (that lives in check-matrix.ts / verification-runner.ts);
// it is purely "run the runner, then persist what it reported."
//
// Not wired into the worker yet — Task 6 calls into this module. Callers
// pass in the admin Supabase client (never constructed here, mirrors every
// other lib/builder/*.ts module).

import type { SupabaseClient } from '@/lib/database-client';
import type { CheckKey } from './check-matrix';
import type { CheckExecution, VerificationRunner } from './verification-runner';
import {
  capAndRedactLog,
  sha256Hex,
  putTextArtifact,
  readTextArtifact,
  artifactPrefix,
  ARTIFACT_KEYS,
} from './artifacts';

const VERIFICATION_RUNS_TABLE = 'builder_verification_runs';

/** Per-check log cap (brief-mandated). */
const MAX_LOG_BYTES = 200_000;
/** Setup-failure evidence cap (brief-mandated) — smaller since it's a single message, not a subprocess log. */
const MAX_SETUP_DETAIL_BYTES = 10_000;

export interface VerificationRecordResult {
  /** Findings to insert when setup failed (reviewer_kind 'deterministic_check', severity 'blocker', state 'open'). Empty when setup succeeded. */
  setupFindings: Array<{
    reviewer_kind: 'deterministic_check';
    severity: 'blocker';
    category: 'verification';
    evidence: string;
    state: 'open';
  }>;
  /** Informational only — the review gate remains the sole authority on pass/fail. */
  allRequiredPassed: boolean;
  /** Immutable evidence created from the real pinned-base diff. */
  authoritativeDiff: { hash: string; artifactKey: string; text: string } | null;
}

/**
 * Uploads a check's capped+redacted log as a durable artifact. Upload
 * failures are caught: verification evidence (the DB row, the pass/fail
 * status) must not be lost to a storage hiccup, so the row is still
 * upserted with log_artifact_key: null on failure.
 */
async function uploadCheckLog(
  admin: SupabaseClient,
  artifactKey: string,
  cappedLog: string,
  checkKey: CheckKey
): Promise<string | null> {
  try {
    await putTextArtifact(admin, artifactKey, cappedLog);
    return artifactKey;
  } catch (err) {
    console.warn(`[Builder] verification log upload failed for ${checkKey}:`, err);
    return null;
  }
}

async function recordCheck(
  admin: SupabaseClient,
  prefix: string,
  attemptId: string,
  exec: CheckExecution
): Promise<void> {
  const cappedLog = capAndRedactLog(exec.log, MAX_LOG_BYTES);
  const artifactKey = `${prefix}/${ARTIFACT_KEYS.checkLog(exec.key)}`;
  const logArtifactKey = await uploadCheckLog(admin, artifactKey, cappedLog, exec.key);

  const { error } = await admin.from(VERIFICATION_RUNS_TABLE).upsert(
    {
      review_attempt_id: attemptId,
      check_key: exec.key,
      status: exec.status,
      exit_code: exec.exitCode,
      duration_ms: exec.durationMs,
      command_version: exec.commandVersion,
      log_artifact_key: logArtifactKey,
      evidence_hash: sha256Hex(cappedLog),
      started_at: exec.startedAt,
      completed_at: exec.completedAt,
    },
    { onConflict: 'review_attempt_id,check_key' }
  );
  if (error) throw error;
}

export async function runAndRecordVerification(
  admin: SupabaseClient,
  args: {
    orgId: string;
    proposalId: string;
    revisionId: string;
    attemptId: string;
    files: Array<{ path: string; content: string }>;
    baseSha: string | null;
    requiredKeys: CheckKey[];
    runner: VerificationRunner;
  }
): Promise<VerificationRecordResult> {
  const { orgId, proposalId, revisionId, attemptId, files, baseSha, requiredKeys, runner } = args;

  const outcome = await runner.run({ baseSha, files, requiredKeys });
  const prefix = artifactPrefix(orgId, proposalId, revisionId);

  for (const exec of outcome.checks) {
    await recordCheck(admin, prefix, attemptId, exec);
  }

  const setupFindings: VerificationRecordResult['setupFindings'] = [];
  if (outcome.setupFailure !== null) {
    const { stage, detail } = outcome.setupFailure;
    setupFindings.push({
      reviewer_kind: 'deterministic_check',
      severity: 'blocker',
      category: 'verification',
      evidence: capAndRedactLog(`verification setup failed at ${stage}: ${detail}`, MAX_SETUP_DETAIL_BYTES),
      state: 'open',
    });
  }

  let authoritativeDiff: VerificationRecordResult['authoritativeDiff'] = null;
  if (outcome.authoritativeDiff === null) {
    if (outcome.setupFailure === null) {
      setupFindings.push({
        reviewer_kind: 'deterministic_check',
        severity: 'blocker',
        category: 'verification',
        evidence: 'verification completed without producing an authoritative diff from the pinned base commit',
        state: 'open',
      });
    }
  } else {
    const artifactKey = `${prefix}/${ARTIFACT_KEYS.authoritativeDiff}`;
    const hash = sha256Hex(outcome.authoritativeDiff);
    try {
      const existing = await readTextArtifact(admin, artifactKey);
      if (existing === null) {
        await putTextArtifact(admin, artifactKey, outcome.authoritativeDiff, 'text/x-diff');
      } else if (sha256Hex(existing) !== hash) {
        throw new Error('authoritative diff artifact already exists with a different hash');
      }

      const { error } = await admin
        .from('builder_proposal_revisions')
        .update({
          authoritative_diff_hash: hash,
          authoritative_diff_artifact_key: artifactKey,
        })
        .eq('id', revisionId)
        .eq('proposal_id', proposalId);
      if (error) throw error;
      authoritativeDiff = { hash, artifactKey, text: outcome.authoritativeDiff };
    } catch (error) {
      setupFindings.push({
        reviewer_kind: 'deterministic_check',
        severity: 'blocker',
        category: 'verification',
        evidence: capAndRedactLog(
          `authoritative diff evidence could not be persisted: ${error instanceof Error ? error.message : String(error)}`,
          MAX_SETUP_DETAIL_BYTES
        ),
        state: 'open',
      });
    }
  }

  const allRequiredPassed = requiredKeys.every(
    (key) => outcome.checks.find((c) => c.key === key)?.status === 'passed'
  );

  return {
    setupFindings,
    allRequiredPassed: setupFindings.length === 0 && allRequiredPassed,
    authoritativeDiff,
  };
}
