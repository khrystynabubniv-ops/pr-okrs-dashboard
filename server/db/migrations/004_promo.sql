-- Promo Results: Meta Ads snapshots, AI analyses and team comments on creatives.

create table if not exists promo_snapshots (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  fetched_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  constraint promo_snapshots_month_unique unique (month)
);

create table if not exists promo_analyses (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  type text not null default 'all',
  created_at timestamptz not null default now(),
  created_by uuid references app_users(id) on delete set null,
  model text not null default '',
  input_hash text not null default '',
  result jsonb not null default '{}'::jsonb,
  status text not null default 'ok'
);

create index if not exists idx_promo_analyses_month_type
  on promo_analyses(month, type, created_at desc);

create table if not exists promo_creative_comments (
  id uuid primary key default gen_random_uuid(),
  ad_id text not null,
  author_id uuid references app_users(id) on delete set null,
  author_name text not null default '',
  text text not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_promo_creative_comments_ad_id
  on promo_creative_comments(ad_id);
