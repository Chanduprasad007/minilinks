create extension if not exists pgcrypto;

create table if not exists links (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  long_url text not null,
  title text not null default '',
  campaign text not null default '',
  domain text not null default 'mini.local',
  qr_enabled boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists click_events (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references links(id) on delete cascade,
  slug text not null,
  referrer text not null default '',
  browser text not null default 'Other',
  ip_hash text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_prefix text not null unique,
  key_hash text not null unique,
  scopes text[] not null default array['links:read', 'links:write', 'analytics:read'],
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists links_slug_idx on links(slug);
create index if not exists links_domain_slug_idx on links(domain, slug);
create index if not exists click_events_link_id_idx on click_events(link_id);
create index if not exists click_events_created_at_idx on click_events(created_at);
create index if not exists api_keys_key_prefix_idx on api_keys(key_prefix);

alter table links enable row level security;
alter table click_events enable row level security;
alter table api_keys enable row level security;

-- The current backend uses the Supabase service-role key from Render.
-- That bypasses RLS. When you add real user login, replace this with
-- workspace-owned policies instead of exposing these tables directly.
