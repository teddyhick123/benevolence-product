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
