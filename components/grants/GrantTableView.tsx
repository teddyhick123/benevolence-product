'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useState, useMemo, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { LIFECYCLE_STAGES } from '@/lib/grants/lifecycle-shared';
import { GRANT_RISK_BADGE, grantStageBadgeClass, grantStageLabel } from './grantPalette';
import type { GrantListItem } from './GrantPipelineView';
import { useStageLabels } from '@/lib/hooks/use-stage-labels';
import { useEntityVocabulary } from '@/lib/hooks/use-entity-vocabulary';
import { resolveGrantsTableColumns, type GrantsTableColumn } from '@/lib/organizations/view-config';

function fmt(v: number | null | undefined, currency = 'USD'): string {
  if (v == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.round((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

interface OrgMember { id: string; display_name?: string | null; email?: string | null }
type CustomFieldDefinition = {
  id: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'integer' | 'decimal' | 'boolean' | 'date' | 'enum';
  enum_options: Array<{ value: string; label: string }> | null;
  sort_order: number;
};

interface Props {
  grants: GrantListItem[];
  loading?: boolean;
  members?: OrgMember[];
  onNewGrant?: () => void;
  orgId?: string | null;
}

type SortKey = 'name' | 'stage' | 'amount' | 'period_end' | 'risk' | `custom:${string}`;
type SortDir = 'asc' | 'desc';
type CustomFilterOperator = 'contains' | 'eq' | 'lt' | 'lte' | 'gt' | 'gte';

function customValueLabel(field: CustomFieldDefinition, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field.field_type === 'boolean') return value === true ? 'Yes' : 'No';
  if (field.field_type === 'enum') {
    const option = field.enum_options?.find(opt => opt.value === value);
    return option?.label ?? String(value);
  }
  if (field.field_type === 'date') return fmtDate(String(value));
  return String(value);
}

function compareCustomValues(field: CustomFieldDefinition | undefined, a: unknown, b: unknown): number {
  if (a === null || a === undefined || a === '') return b === null || b === undefined || b === '' ? 0 : 1;
  if (b === null || b === undefined || b === '') return -1;
  if (field?.field_type === 'integer' || field?.field_type === 'decimal') {
    const an = Number(a);
    const bn = Number(b);
    return an < bn ? -1 : an > bn ? 1 : 0;
  }
  if (field?.field_type === 'boolean') {
    return Number(Boolean(a)) - Number(Boolean(b));
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

function matchesCustomFilter(field: CustomFieldDefinition | undefined, value: unknown, operator: CustomFilterOperator, rawFilter: string): boolean {
  if (!field || rawFilter === '') return true;
  if (value === null || value === undefined || value === '') return false;

  if (field.field_type === 'integer' || field.field_type === 'decimal') {
    const actual = Number(value);
    const expected = Number(rawFilter);
    if (!Number.isFinite(expected)) return true;
    if (operator === 'lt') return actual < expected;
    if (operator === 'lte') return actual <= expected;
    if (operator === 'gt') return actual > expected;
    if (operator === 'gte') return actual >= expected;
    return actual === expected;
  }

  if (field.field_type === 'boolean') {
    return String(Boolean(value)) === rawFilter;
  }

  if (operator === 'eq') return String(value) === rawFilter;
  return customValueLabel(field, value).toLowerCase().includes(rawFilter.toLowerCase());
}

export default function GrantTableView({ grants, loading, members = [], onNewGrant, orgId }: Props) {
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [riskFilter, setRiskFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('period_end');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [customFields, setCustomFields] = useState<CustomFieldDefinition[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, Record<string, unknown>>>({});
  const [customFilterField, setCustomFilterField] = useState('');
  const [customFilterOperator, setCustomFilterOperator] = useState<CustomFilterOperator>('contains');
  const [customFilterValue, setCustomFilterValue] = useState('');
  const [tableColumns, setTableColumns] = useState<GrantsTableColumn[]>(resolveGrantsTableColumns(null));
  const { getLabel } = useStageLabels(orgId);
  const vocabulary = useEntityVocabulary(orgId);
  const grantLabel = vocabulary.grant;

  const grantIdsKey = useMemo(() => grants.map(g => g.id).sort().join(','), [grants]);

  useEffect(() => {
    if (!orgId || grants.length === 0) {
      setCustomFields([]);
      setCustomValues({});
      return;
    }

    let cancelled = false;
    const ids = grants.map(g => g.id).join(',');
    apiRequest(`/api/org/${orgId}/custom-fields/batch?entity_type=grant&entity_ids=${encodeURIComponent(ids)}`)
      .then(async res => {
        const json = await readJson(res).catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? 'Failed to load custom fields');
        return json;
      })
      .then(json => {
        if (cancelled) return;
        setCustomFields(json.fields ?? []);
        setCustomValues(json.values_by_entity ?? {});
      })
      .catch(() => {
        if (cancelled) return;
        setCustomFields([]);
        setCustomValues({});
      });

    return () => {
      cancelled = true;
    };
  }, [orgId, grantIdsKey]);

  useEffect(() => {
    if (!orgId) {
      setTableColumns(resolveGrantsTableColumns(null));
      return;
    }

    let cancelled = false;
    apiRequest(`/api/org/${orgId}/view-config?scope=table_columns&scope_key=grants_table`)
      .then(async res => {
        const json = await readJson(res).catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? 'Failed to load table columns');
        return json;
      })
      .then(json => {
        if (cancelled) return;
        setTableColumns(resolveGrantsTableColumns(json.configs?.[0]?.config_value));
      })
      .catch(() => {
        if (!cancelled) setTableColumns(resolveGrantsTableColumns(null));
      });

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const customFieldByKey = useMemo(() => {
    return new Map(customFields.map(field => [field.field_key, field]));
  }, [customFields]);

  const memberMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const mb of members) {
      m.set(mb.id, mb.display_name ?? mb.email ?? mb.id.slice(0, 8));
    }
    return m;
  }, [members]);

  const handleSort = useCallback((key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }, [sortKey]);

  const filtered = useMemo(() => {
    let rows = grants;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(g => (g.holdings?.name ?? '').toLowerCase().includes(q));
    }
    if (stageFilter) rows = rows.filter(g => g.lifecycle_stage === stageFilter);
    if (riskFilter) rows = rows.filter(g => g.risk_level === riskFilter);
    if (ownerFilter) rows = rows.filter(g => g.internal_owner_id === ownerFilter);
    if (customFilterField && customFilterValue !== '') {
      const field = customFieldByKey.get(customFilterField);
      rows = rows.filter(g => matchesCustomFilter(
        field,
        customValues[g.id]?.[customFilterField],
        customFilterOperator,
        customFilterValue
      ));
    }

    rows = [...rows].sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortKey === 'name') { va = a.holdings?.name ?? ''; vb = b.holdings?.name ?? ''; }
      if (sortKey === 'stage') { va = LIFECYCLE_STAGES.indexOf(a.lifecycle_stage); vb = LIFECYCLE_STAGES.indexOf(b.lifecycle_stage); }
      if (sortKey === 'amount') { va = a.approved_amount ?? a.requested_amount ?? 0; vb = b.approved_amount ?? b.requested_amount ?? 0; }
      if (sortKey === 'period_end') { va = a.grant_period_end ?? '9999'; vb = b.grant_period_end ?? '9999'; }
      if (sortKey === 'risk') {
        const order = { critical: 0, high: 1, medium: 2, low: 3, '': 4 };
        va = (order as any)[a.risk_level ?? ''] ?? 4;
        vb = (order as any)[b.risk_level ?? ''] ?? 4;
      }
      const cmp = sortKey.startsWith('custom:')
        ? compareCustomValues(
          customFieldByKey.get(sortKey.replace('custom:', '')),
          customValues[a.id]?.[sortKey.replace('custom:', '')],
          customValues[b.id]?.[sortKey.replace('custom:', '')]
        )
        : va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return rows;
  }, [grants, search, stageFilter, riskFilter, ownerFilter, sortKey, sortDir, customFilterField, customFilterOperator, customFilterValue, customFieldByKey, customValues]);

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <span className="text-neutral-300 ml-1">↕</span>;
    return <span className="text-azure ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  }

  const selectedCustomFilter = customFieldByKey.get(customFilterField);
  const visibleColumns = useMemo(() => new Set(tableColumns), [tableColumns]);
  const configuredCustomKeys = useMemo(() => {
    return tableColumns
      .filter(column => column.startsWith('custom:'))
      .map(column => column.replace('custom:', ''));
  }, [tableColumns]);
  const visibleCustomFields = useMemo(() => {
    if (visibleColumns.has('custom_fields')) return customFields;
    if (configuredCustomKeys.length === 0) return [];
    const keys = new Set(configuredCustomKeys);
    return customFields.filter(field => keys.has(field.field_key));
  }, [configuredCustomKeys, customFields, visibleColumns]);

  const th = 'px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide cursor-pointer select-none hover:text-neutral-700';

  if (loading && grants.length === 0) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-10 bg-neutral-100 rounded-xl" />
        {[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-neutral-100 rounded-xl" />)}
      </div>
    );
  }

  if (grants.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-14 h-14 rounded-full bg-azure/10 flex items-center justify-center">
          <svg className="w-7 h-7 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <p className="font-medium text-ink">No {grantLabel.plural.toLowerCase()} yet</p>
          <p className="text-sm text-neutral-500 mt-1">Add {grantLabel.plural.toLowerCase()} to see them in the table view.</p>
        </div>
        {onNewGrant && (
          <button onClick={onNewGrant} className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-azure rounded-2xl hover:bg-azure/90">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New {grantLabel.singular}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search grantees…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-black/5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-azure/30"
          />
        </div>

        <select
          value={stageFilter}
          onChange={e => setStageFilter(e.target.value)}
          className="text-sm border border-black/5 rounded-2xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-azure/30 bg-white"
        >
          <option value="">All Stages</option>
          {LIFECYCLE_STAGES.map(s => (
            <option key={s} value={s}>{orgId ? getLabel(s) : grantStageLabel(s)}</option>
          ))}
        </select>

        <select
          value={riskFilter}
          onChange={e => setRiskFilter(e.target.value)}
          className="text-sm border border-black/5 rounded-2xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-azure/30 bg-white"
        >
          <option value="">All Risk</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {members.length > 0 && (
          <select
            value={ownerFilter}
            onChange={e => setOwnerFilter(e.target.value)}
            className="text-sm border border-black/5 rounded-2xl px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-azure/30 bg-white"
          >
            <option value="">All Owners</option>
            {members.map(m => (
              <option key={m.id} value={m.id}>{m.display_name ?? m.email ?? m.id.slice(0, 8)}</option>
            ))}
          </select>
        )}

        {customFields.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-black/5 bg-white px-2 py-1">
            <select
              value={customFilterField}
              onChange={e => {
                setCustomFilterField(e.target.value);
                setCustomFilterValue('');
                setCustomFilterOperator(e.target.value ? 'contains' : 'contains');
              }}
              className="text-sm bg-white px-2 py-1 focus:outline-none"
              aria-label="Custom field filter"
            >
              <option value="">Custom field</option>
              {customFields.map(field => (
                <option key={field.id} value={field.field_key}>{field.field_label}</option>
              ))}
            </select>
            {customFilterField && (
              <>
                {(selectedCustomFilter?.field_type === 'integer' || selectedCustomFilter?.field_type === 'decimal') ? (
                  <select
                    value={customFilterOperator}
                    onChange={e => setCustomFilterOperator(e.target.value as CustomFilterOperator)}
                    className="text-sm bg-white px-2 py-1 focus:outline-none"
                    aria-label="Custom field operator"
                  >
                    <option value="eq">=</option>
                    <option value="lt">&lt;</option>
                    <option value="lte">≤</option>
                    <option value="gt">&gt;</option>
                    <option value="gte">≥</option>
                  </select>
                ) : (
                  <input type="hidden" value={customFilterOperator} readOnly />
                )}
                {selectedCustomFilter?.field_type === 'boolean' ? (
                  <select
                    value={customFilterValue}
                    onChange={e => {
                      setCustomFilterOperator('eq');
                      setCustomFilterValue(e.target.value);
                    }}
                    className="text-sm bg-white px-2 py-1 focus:outline-none"
                  >
                    <option value="">Any</option>
                    <option value="true">Yes</option>
                    <option value="false">No</option>
                  </select>
                ) : selectedCustomFilter?.field_type === 'enum' ? (
                  <select
                    value={customFilterValue}
                    onChange={e => {
                      setCustomFilterOperator('eq');
                      setCustomFilterValue(e.target.value);
                    }}
                    className="text-sm bg-white px-2 py-1 focus:outline-none"
                  >
                    <option value="">Any</option>
                    {(selectedCustomFilter.enum_options ?? []).map(option => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={selectedCustomFilter?.field_type === 'date' ? 'date' : selectedCustomFilter?.field_type === 'integer' || selectedCustomFilter?.field_type === 'decimal' ? 'number' : 'text'}
                    value={customFilterValue}
                    onChange={e => setCustomFilterValue(e.target.value)}
                    placeholder={selectedCustomFilter?.field_type === 'text' ? 'Contains…' : 'Value…'}
                    className="w-28 text-sm bg-white px-2 py-1 focus:outline-none"
                  />
                )}
              </>
            )}
          </div>
        )}

        {(search || stageFilter || riskFilter || ownerFilter || customFilterField || customFilterValue) && (
          <button
            onClick={() => { setSearch(''); setStageFilter(''); setRiskFilter(''); setOwnerFilter(''); setCustomFilterField(''); setCustomFilterValue(''); setCustomFilterOperator('contains'); }}
            className="text-xs text-neutral-400 hover:text-neutral-600"
          >
            Clear filters
          </button>
        )}

        <span className="ml-auto text-xs text-neutral-400">{filtered.length} {filtered.length === 1 ? grantLabel.singular.toLowerCase() : grantLabel.plural.toLowerCase()}</span>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-black/5 bg-white shadow-soft shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-neutral-400">No {grantLabel.plural.toLowerCase()} match your filters.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-black/5">
                <tr>
                  {visibleColumns.has('name') && (
                    <th className={th} onClick={() => handleSort('name')}>
                      {grantLabel.singular} <SortIcon col="name" />
                    </th>
                  )}
                  {visibleColumns.has('stage') && (
                    <th className={th} onClick={() => handleSort('stage')}>
                      Stage <SortIcon col="stage" />
                    </th>
                  )}
                  {visibleColumns.has('amount') && (
                    <th className={th} onClick={() => handleSort('amount')}>
                      Amount <SortIcon col="amount" />
                    </th>
                  )}
                  {visibleColumns.has('risk') && (
                    <th className={th} onClick={() => handleSort('risk')}>
                      Risk <SortIcon col="risk" />
                    </th>
                  )}
                  {visibleCustomFields.map(field => (
                    <th key={field.id} className={th} onClick={() => handleSort(`custom:${field.field_key}`)}>
                      {field.field_label} <SortIcon col={`custom:${field.field_key}`} />
                    </th>
                  ))}
                  {visibleColumns.has('period_end') && (
                    <th className={th} onClick={() => handleSort('period_end')}>
                      Period End <SortIcon col="period_end" />
                    </th>
                  )}
                  {visibleColumns.has('portfolio') && (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                      Portfolio
                    </th>
                  )}
                  {visibleColumns.has('owner') && members.length > 0 && <th className={th}>Owner</th>}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filtered.map(g => {
                  const amount = g.approved_amount ?? g.requested_amount;
                  const days = daysUntil(g.grant_period_end);
                  return (
                    <tr key={g.id} className="hover:bg-neutral-50/60 transition-colors">
                      {visibleColumns.has('name') && (
                        <td className="px-4 py-3">
                          <Link href={`/dashboard/grants/${g.id}`} title={g.holdings?.name ?? undefined} className="font-medium text-ink hover:text-azure truncate block max-w-[200px]">
                            {g.holdings?.name ?? 'Unnamed'}
                          </Link>
                        </td>
                      )}
                      {visibleColumns.has('stage') && (
                        <td className="px-4 py-3">
                          <span className={grantStageBadgeClass(g.lifecycle_stage)}>
                            {orgId ? getLabel(g.lifecycle_stage) : grantStageLabel(g.lifecycle_stage)}
                          </span>
                        </td>
                      )}
                      {visibleColumns.has('amount') && (
                        <td className="px-4 py-3 text-neutral-700 font-medium">{fmt(amount, g.currency ?? 'USD')}</td>
                      )}
                      {visibleColumns.has('risk') && (
                        <td className="px-4 py-3">
                          {g.risk_level ? (
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${GRANT_RISK_BADGE[g.risk_level] ?? 'border border-neutral-200 bg-neutral-100 text-neutral-600'}`}>
                              {g.risk_level}
                            </span>
                          ) : <span className="text-neutral-300">—</span>}
                        </td>
                      )}
                      {visibleCustomFields.map(field => (
                        <td key={field.id} className="px-4 py-3 text-neutral-600">
                          <span className="block max-w-[160px] truncate" title={customValueLabel(field, customValues[g.id]?.[field.field_key])}>
                            {customValueLabel(field, customValues[g.id]?.[field.field_key])}
                          </span>
                        </td>
                      ))}
                      {visibleColumns.has('period_end') && (
                        <td className="px-4 py-3">
                          <span className="text-neutral-600">{fmtDate(g.grant_period_end)}</span>
                          {days !== null && (
                            <span className={`ml-1.5 text-xs ${days < 0 ? 'text-red-500' : days < 30 ? 'text-coral' : 'text-neutral-400'}`}>
                              ({days < 0 ? `${Math.abs(days)}d ago` : `${days}d`})
                            </span>
                          )}
                        </td>
                      )}
                      {visibleColumns.has('portfolio') && (
                        <td className="px-4 py-3 text-neutral-500 text-xs">
                          {g.portfolios?.name ?? '—'}
                        </td>
                      )}
                      {visibleColumns.has('owner') && members.length > 0 && (
                        <td className="px-4 py-3 text-neutral-500 text-xs">
                          {g.internal_owner_id ? (memberMap.get(g.internal_owner_id) ?? '—') : '—'}
                        </td>
                      )}
                      <td className="px-4 py-3 text-right">
                        <Link href={`/dashboard/grants/${g.id}`} className="text-xs text-azure hover:underline">
                          Open →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
