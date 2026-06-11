create extension if not exists pgcrypto;

create table if not exists schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  name text,
  avatar_url text,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists auth_oauth_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  provider text not null,
  provider_user_id text not null,
  email text,
  raw_profile jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_user_id)
);

create table if not exists auth_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists kpi_goals (
  id uuid primary key default gen_random_uuid(),
  external_source text,
  external_id text,
  source text not null default 'app',
  title text not null,
  direction text not null default 'Employer Brand',
  metric_type text not null default 'Кількісна',
  calculation_type text,
  calculation_label text,
  target_text text,
  target_number numeric,
  criterion text,
  measurement_period text,
  data_source text,
  framework text,
  owner text,
  raw jsonb not null default '{}'::jsonb,
  created_by uuid references app_users(id) on delete set null,
  updated_by uuid references app_users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (external_source, external_id)
);

create table if not exists kpi_goal_values (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references kpi_goals(id) on delete cascade,
  month text not null,
  value text not null default '',
  updated_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (goal_id, month)
);

create table if not exists monthly_focus_entries (
  id uuid primary key default gen_random_uuid(),
  external_source text,
  external_id text,
  source text not null default 'app',
  title text not null,
  month text,
  months jsonb not null default '[]'::jsonb,
  team text,
  owner text,
  owner_id text,
  owner_ids jsonb not null default '[]'::jsonb,
  metric_type text,
  metric text,
  status text not null default 'Не виконано',
  achieved boolean not null default false,
  comment text,
  done text,
  not_done text,
  pains text,
  next_priorities text,
  linked_goal_ids jsonb not null default '[]'::jsonb,
  metric_values jsonb not null default '{}'::jsonb,
  raw jsonb not null default '{}'::jsonb,
  created_by uuid references app_users(id) on delete set null,
  updated_by uuid references app_users(id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (external_source, external_id)
);

create table if not exists competitor_coverage (
  id uuid primary key default gen_random_uuid(),
  month text not null,
  brand text not null,
  mentions integer not null default 0,
  reach numeric not null default 0,
  sentiment text,
  note text,
  created_by uuid references app_users(id) on delete set null,
  updated_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists board_reports (
  id uuid primary key default gen_random_uuid(),
  month text not null,
  report text not null,
  source text not null default 'app',
  notion_page_id text,
  created_by uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists integration_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  status text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_kpi_goals_external on kpi_goals(external_source, external_id);
create index if not exists idx_kpi_values_goal_month on kpi_goal_values(goal_id, month);
create index if not exists idx_monthly_focus_month on monthly_focus_entries(month);
create index if not exists idx_competitor_coverage_month on competitor_coverage(month);
create index if not exists idx_auth_sessions_expires_at on auth_sessions(expires_at);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_app_users_updated_at on app_users;
create trigger set_app_users_updated_at
before update on app_users
for each row execute function set_updated_at();

drop trigger if exists set_auth_oauth_accounts_updated_at on auth_oauth_accounts;
create trigger set_auth_oauth_accounts_updated_at
before update on auth_oauth_accounts
for each row execute function set_updated_at();

drop trigger if exists set_kpi_goals_updated_at on kpi_goals;
create trigger set_kpi_goals_updated_at
before update on kpi_goals
for each row execute function set_updated_at();

drop trigger if exists set_kpi_goal_values_updated_at on kpi_goal_values;
create trigger set_kpi_goal_values_updated_at
before update on kpi_goal_values
for each row execute function set_updated_at();

drop trigger if exists set_monthly_focus_entries_updated_at on monthly_focus_entries;
create trigger set_monthly_focus_entries_updated_at
before update on monthly_focus_entries
for each row execute function set_updated_at();

drop trigger if exists set_competitor_coverage_updated_at on competitor_coverage;
create trigger set_competitor_coverage_updated_at
before update on competitor_coverage
for each row execute function set_updated_at();
