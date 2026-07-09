create table if not exists qb_sync_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  event_type  text not null,   -- 'accounts_sync' | 'contributions_export' | 'grants_export'
  status      text not null,   -- 'success' | 'error'
  record_count int,            -- number of records synced/exported (null on error)
  error_msg   text,            -- error message (null on success)
  created_at  timestamptz not null default now()
);

create index if not exists qb_sync_log_org_created on qb_sync_log(org_id, created_at desc);

alter table qb_sync_log enable row level security;

create policy "qb_sync_log: org admins read"
  on qb_sync_log for select to authenticated
  using (public.is_org_admin(org_id));

create policy "qb_sync_log: service role write"
  on qb_sync_log for all to service_role
  using (true) with check (true);

grant select on qb_sync_log to authenticated;
grant all on qb_sync_log to service_role;

create table if not exists qb_export_attempts (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references organizations(id) on delete cascade,
  export_type           text not null check (export_type in ('contribution', 'grant')),
  source_table          text not null,
  source_id             uuid not null,
  doc_number            text not null,
  expected_amount       numeric(20,2) not null check (expected_amount > 0),
  debit_account_id      text not null,
  credit_account_id     text not null,
  status                text not null check (status in ('in_flight', 'succeeded', 'failed')),
  qb_journal_entry_id   text,
  error_msg             text,
  started_at            timestamptz not null default now(),
  completed_at          timestamptz,
  updated_at            timestamptz not null default now()
);

create unique index if not exists qb_export_attempts_active_unique
  on qb_export_attempts(org_id, export_type, source_id)
  where status in ('in_flight', 'succeeded');

create index if not exists qb_export_attempts_org_status
  on qb_export_attempts(org_id, status, started_at desc);

create trigger trg_qb_export_attempts_updated_at
  before update on qb_export_attempts
  for each row execute function public.set_updated_at();

alter table qb_export_attempts enable row level security;

create policy "qb_export_attempts: org admins read"
  on qb_export_attempts for select to authenticated
  using (public.is_org_admin(org_id));

create policy "qb_export_attempts: service role manage"
  on qb_export_attempts for all to service_role
  using (true) with check (true);

grant select on qb_export_attempts to authenticated;
grant all on qb_export_attempts to service_role;
