-- Promo Results: team edits of the AI blocks (key takeaways, what works / what does not, recommendations).
-- One row per month + campaign type + block; the edit replaces the AI text for everyone until it is reset.

create table if not exists promo_block_edits (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  type text not null default 'all',
  block text not null,
  content jsonb not null default '{}'::jsonb,
  updated_by uuid references app_users(id) on delete set null,
  updated_by_name text not null default '',
  updated_at timestamptz not null default now(),
  constraint promo_block_edits_unique unique (month, type, block)
);
