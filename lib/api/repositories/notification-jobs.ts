import { createElevatedClient } from '@/lib/api/admin-client';
import type { JobAccessContext } from '@/lib/api/principals';
import { runDigestForOrg } from '@/lib/notifications/digest';
import { deliverEmailNotification } from '@/lib/notifications/delivery';
import { fanOutTaskEvent } from '@/lib/notifications/fanout';

type FanoutInput = {
  dryRun: boolean;
  now?: string;
  since?: string;
  taskEventId?: string;
};

type DeliveryInput = { dryRun: boolean };

type DigestInput = {
  dryRun: boolean;
  orgId?: string;
  now?: string;
  since?: string;
};

export class InvalidNotificationJobPrincipalError extends Error {
  constructor() {
    super('Notification worker requires the notifications job principal');
    this.name = 'InvalidNotificationJobPrincipalError';
  }
}

/** Global notification worker operations available only to the notifications job. */
export function createNotificationJobRepository(context: JobAccessContext) {
  if (context.principal.job !== 'notifications') {
    throw new InvalidNotificationJobPrincipalError();
  }

  const db = createElevatedClient();

  return {
    async fanout(input: FanoutInput) {
      let scanned = 0;
      let created = 0;
      let suppressed = 0;
      const errors: Array<{ taskEventId: string; message: string }> = [];

      try {
        const until = input.now ? new Date(input.now) : new Date();
        const since = input.since
          ? new Date(input.since)
          : new Date(until.getTime() - 24 * 60 * 60 * 1000);
        let query = db
          .from('task_events')
          .select('id')
          .gte('created_at', since.toISOString())
          .lte('created_at', until.toISOString());

        if (input.taskEventId) query = query.eq('id', input.taskEventId);

        const { data: events, error: fetchError } = await query;
        if (fetchError) throw fetchError;

        const eventIds = (events ?? []).map((event: any) => event.id as string);
        scanned = eventIds.length;
        if (eventIds.length === 0) {
          return { ok: true as const, scanned, created, suppressed, errors };
        }

        const { data: alreadyFannedOut, error: alreadyFannedOutError } = await db
          .from('notification_events')
          .select('task_event_id')
          .in('task_event_id', eventIds);
        // Without this set the run would re-fan-out every scanned event.
        if (alreadyFannedOutError) throw alreadyFannedOutError;

        const completedIds = new Set(
          (alreadyFannedOut ?? []).map((event: any) => event.task_event_id as string)
        );
        const pendingIds = eventIds.filter(id => !completedIds.has(id));

        for (const taskEventId of pendingIds) {
          if (input.dryRun) {
            suppressed++;
            continue;
          }
          const result = await fanOutTaskEvent(db, {
            taskEventId,
            now: input.now,
          });
          created += result.created;
          suppressed += result.suppressed;
          if (result.error) errors.push({ taskEventId, message: result.error });
        }

        return { ok: true as const, scanned, created, suppressed, errors };
      } catch (error: any) {
        return {
          ok: false as const,
          error: error.message,
          scanned,
          created,
          suppressed,
          errors,
        };
      }
    },

    async deliver(input: DeliveryInput) {
      let scanned = 0;
      let sent = 0;
      let suppressed = 0;
      let failed = 0;
      const errors: Array<{ notificationId: string; message: string }> = [];

      try {
        const now = new Date().toISOString();
        const [pendingResult, retryResult] = await Promise.all([
          db
            .from('notification_events')
            .select('id')
            .eq('channel', 'email')
            .eq('status', 'pending')
            .lte('scheduled_for', now)
            .limit(200),
          db
            .from('notification_events')
            .select('id')
            .eq('channel', 'email')
            .eq('status', 'failed')
            .lte('next_attempt_at', now)
            .limit(200),
        ]);
        // Both scans must succeed; a partial scan would silently skip due work.
        if (pendingResult.error) throw pendingResult.error;
        if (retryResult.error) throw retryResult.error;

        const ids = [
          ...((pendingResult.data ?? []).map((event: any) => event.id as string)),
          ...((retryResult.data ?? []).map((event: any) => event.id as string)),
        ];
        scanned = ids.length;

        for (const notificationId of ids) {
          if (input.dryRun) {
            suppressed++;
            continue;
          }
          const result = await deliverEmailNotification(db, notificationId, false);
          if (result === 'sent') sent++;
          else if (result === 'suppressed') suppressed++;
          else {
            failed++;
            errors.push({
              notificationId,
              message: 'delivery failed — see logs',
            });
          }
        }

        return { ok: true as const, scanned, sent, suppressed, failed, errors };
      } catch (error: any) {
        return {
          ok: false as const,
          error: error.message,
          scanned,
          sent,
          suppressed,
          failed,
          errors,
        };
      }
    },

    async digest(input: DigestInput) {
      let sent = 0;
      let skipped = 0;
      const errors: string[] = [];

      try {
        const periodEnd = input.now ?? new Date().toISOString();
        const periodStart = input.since
          ?? new Date(new Date(periodEnd).getTime() - 7 * 24 * 60 * 60 * 1000)
            .toISOString();
        let query = db.from('organizations').select('id');
        if (input.orgId) query = query.eq('id', input.orgId);

        const { data: organizations, error: organizationsError } = await query;
        if (organizationsError) throw organizationsError;

        for (const organization of (organizations ?? []) as Array<{ id: string }>) {
          try {
            const result = await runDigestForOrg(
              db,
              organization.id,
              periodStart,
              periodEnd,
              input.dryRun
            );
            sent += result.sent;
            skipped += result.skipped;
            errors.push(...result.errors);
          } catch (error: any) {
            errors.push(`org ${organization.id}: ${error.message}`);
          }
        }

        return {
          ok: true as const,
          orgs_processed: organizations?.length ?? 0,
          sent,
          skipped,
          errors,
        };
      } catch (error: any) {
        return { ok: false as const, error: error.message };
      }
    },
  };
}
