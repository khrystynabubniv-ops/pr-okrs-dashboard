-- Promo Results: manual applies per vacancy and platform-aware creative comments.

create table if not exists promo_vacancy_applies (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  vacancy_key text not null,
  vacancy_title text not null default '',
  applies integer not null check (applies >= 0),
  -- 'manual' today; leaves room for values imported from Ashby later.
  source text not null default 'manual',
  updated_by uuid references app_users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint promo_vacancy_applies_unique unique (month, vacancy_key)
);

alter table promo_creative_comments
  add column if not exists platform text not null default 'meta';

create index if not exists idx_promo_creative_comments_platform_ad
  on promo_creative_comments(platform, ad_id);
