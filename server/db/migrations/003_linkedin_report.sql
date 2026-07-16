create table if not exists linkedin_report_data (
  id text primary key default 'default',
  months jsonb not null default '[]'::jsonb,
  pr jsonb not null default '[]'::jsonb,
  people jsonb not null default '[]'::jsonb,
  updated_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint linkedin_report_data_singleton check (id = 'default')
);

alter table linkedin_report_data
add column if not exists people jsonb not null default '[]'::jsonb;
