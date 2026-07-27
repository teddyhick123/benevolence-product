import { NextRequest } from 'next/server';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'viewer');
    if (!access.ok) return access.response;

    const { searchParams } = new URL(req.url);
    const portfolioId = searchParams.get('portfolio_id');
    const requestedDaysAhead = Number.parseInt(searchParams.get('days_ahead') ?? '120', 10);
    const daysAhead = Number.isFinite(requestedDaysAhead) && requestedDaysAhead > 0
      ? Math.min(requestedDaysAhead, 365)
      : 120;

    const db = access.context.db;
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const horizon = new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);

    // Build base grant filter (grants in this org, optionally filtered by portfolio)
    let grantQuery = db.from('grants').select('id, holding_id, portfolio_id, holdings!inner(name)').eq('org_id', orgId).is('deleted_at', null);
    if (portfolioId) grantQuery = grantQuery.eq('portfolio_id', portfolioId);
    const { data: grantRows } = await (grantQuery as any);
    const grants: { id: string; holding_id: string; grantee_name: string }[] = (grantRows ?? []).map((g: any) => ({
      id: g.id,
      holding_id: g.holding_id,
      grantee_name: g.holdings?.name ?? 'Unknown',
    }));
    const grantIds = grants.map(g => g.id);
    const grantMap = new Map(grants.map(g => [g.id, g]));

    if (grantIds.length === 0) {
      return jsonOk({ events: [] });
    }

    const events: any[] = [];

    // Milestones
    const { data: milestones } = await db
      .from('grant_milestones')
      .select('id, grant_id, milestone_name, due_date, status')
      .in('grant_id', grantIds)
      .not('status', 'in', '(completed,cancelled)')
      .gte('due_date', cutoff)
      .lte('due_date', horizon)
      .order('due_date', { ascending: true });

    for (const m of milestones ?? []) {
      const g = grantMap.get(m.grant_id);
      events.push({
        id: `milestone:${m.id}`,
        grant_id: m.grant_id,
        title: m.milestone_name ?? 'Milestone',
        event_type: 'milestone',
        due_date: m.due_date,
        grantee_name: g?.grantee_name ?? '',
      });
    }

    // Reports
    const { data: reports } = await db
      .from('grant_reports')
      .select('id, grant_id, report_type, due_date, submitted_date, received_at')
      .in('grant_id', grantIds)
      .is('submitted_date', null)
      .is('received_at', null)
      .gte('due_date', cutoff)
      .lte('due_date', horizon)
      .order('due_date', { ascending: true });

    for (const r of reports ?? []) {
      const g = grantMap.get(r.grant_id);
      events.push({
        id: `report:${r.id}`,
        grant_id: r.grant_id,
        title: `${(r.report_type ?? 'report').replace(/_/g, ' ')} report`,
        event_type: 'report',
        due_date: r.due_date,
        grantee_name: g?.grantee_name ?? '',
      });
    }

    // Payments
    const { data: payments } = await db
      .from('grant_payments')
      .select('id, grant_id, payment_number, amount, scheduled_date, status')
      .in('grant_id', grantIds)
      .not('status', 'in', '(completed,cancelled,returned)')
      .gte('scheduled_date', cutoff)
      .lte('scheduled_date', horizon)
      .order('scheduled_date', { ascending: true });

    for (const p of payments ?? []) {
      const g = grantMap.get(p.grant_id);
      const amt = p.amount ? ` ($${Number(p.amount).toLocaleString()})` : '';
      events.push({
        id: `payment:${p.id}`,
        grant_id: p.grant_id,
        title: `Payment #${p.payment_number}${amt}`,
        event_type: 'payment',
        due_date: p.scheduled_date,
        grantee_name: g?.grantee_name ?? '',
      });
    }

    // Period ends (upcoming renewals/closeouts from grant rows)
    const { data: endingGrants } = await db
      .from('grants')
      .select('id, holding_id, lifecycle_stage, grant_period_end, renewal_eligible, holdings!inner(name)')
      .in('id', grantIds)
      .is('deleted_at', null)
      .in('lifecycle_stage', ['active', 'renewal_review', 'closeout'])
      .gte('grant_period_end', cutoff)
      .lte('grant_period_end', horizon)
      .order('grant_period_end', { ascending: true });

    for (const g of endingGrants ?? []) {
      const eventType = g.lifecycle_stage === 'renewal_review' ? 'renewal' :
                        g.lifecycle_stage === 'closeout' ? 'closeout' : 'period_end';
      events.push({
        id: `grant_end:${g.id}`,
        grant_id: g.id,
        title: g.lifecycle_stage === 'renewal_review' ? 'Renewal deadline' :
               g.lifecycle_stage === 'closeout' ? 'Closeout deadline' : 'Grant period ends',
        event_type: eventType,
        due_date: g.grant_period_end,
        grantee_name: (g as any).holdings?.name ?? '',
      });
    }

    events.sort((a, b) => a.due_date.localeCompare(b.due_date));

    return jsonOk({ events });
  } catch (err: unknown) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}
