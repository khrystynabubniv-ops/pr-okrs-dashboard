create table if not exists event_reports (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'event',
  name text not null,
  event_date date,
  report jsonb not null default '{}'::jsonb,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_event_reports_created_at on event_reports(created_at desc);
