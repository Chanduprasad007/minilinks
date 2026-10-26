-- MiniLinks production schema for Supabase.
-- Run this entire file in the Supabase SQL Editor. Supabase already provides
-- gen_random_uuid(), so this script intentionally does not create extensions.

create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  plan text not null default 'starter' check (plan in ('starter', 'growth', 'business', 'enterprise')),
  created_at timestamptz not null default now()
);

insert into workspaces (id, name, slug, plan)
values ('00000000-0000-4000-8000-000000000001', 'MiniLinks HQ', 'minilinks-hq', 'starter')
on conflict (id) do nothing;

create table if not exists workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id text not null,
  email text not null,
  role text not null default 'member' check (role in ('owner', 'admin', 'developer', 'analyst', 'member')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table if not exists links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  slug text not null unique,
  long_url text not null,
  title text not null default '',
  campaign text not null default '',
  domain text not null default 'mini.local',
  qr_enabled boolean not null default true,
  active boolean not null default true,
  risk_status text not null default 'clean' check (risk_status in ('pending', 'clean', 'blocked', 'review')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table links add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table links add column if not exists risk_status text not null default 'clean';
update links set workspace_id = '00000000-0000-4000-8000-000000000001' where workspace_id is null;

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
  workspace_id uuid references workspaces(id) on delete cascade,
  name text not null,
  key_prefix text not null unique,
  key_hash text not null unique,
  scopes text[] not null default array['links:read', 'links:write'],
  created_by text,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table api_keys add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
alter table api_keys add column if not exists created_by text;
update api_keys set workspace_id = '00000000-0000-4000-8000-000000000001' where workspace_id is null;

create table if not exists billing_accounts (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  plan text not null default 'starter',
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'canceled')),
  stripe_customer_id text,
  stripe_subscription_id text,
  monthly_links integer not null default 1000,
  updated_at timestamptz not null default now()
);

insert into billing_accounts (workspace_id, plan, status, monthly_links)
values ('00000000-0000-4000-8000-000000000001', 'starter', 'trialing', 1000)
on conflict (workspace_id) do nothing;

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  actor_id text not null,
  action text not null,
  target_type text not null,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists phishing_reports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete set null,
  url text not null,
  reason text not null,
  reporter_email text not null default '',
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'dismissed')),
  created_at timestamptz not null default now()
);

create table if not exists takedown_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  link_id uuid not null references links(id) on delete cascade,
  reason text not null,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected', 'completed')),
  reviewer_note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists malware_scans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete set null,
  url text not null,
  verdict text not null check (verdict in ('clean', 'blocked', 'review')),
  signals text[] not null default array[]::text[],
  provider text not null default 'minilinks-heuristics',
  created_at timestamptz not null default now()
);

create table if not exists blocked_domains (
  id uuid primary key default gen_random_uuid(),
  domain text not null unique,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists links_slug_idx on links(slug);
create index if not exists links_workspace_idx on links(workspace_id);
create index if not exists click_events_link_id_idx on click_events(link_id);
create index if not exists click_events_created_at_idx on click_events(created_at);
create index if not exists api_keys_key_prefix_idx on api_keys(key_prefix);
create index if not exists audit_logs_workspace_created_idx on audit_logs(workspace_id, created_at desc);
create index if not exists malware_scans_url_idx on malware_scans(url);

alter table workspaces enable row level security;
alter table workspace_members enable row level security;
alter table links enable row level security;
alter table click_events enable row level security;
alter table api_keys enable row level security;
alter table billing_accounts enable row level security;
alter table audit_logs enable row level security;
alter table phishing_reports enable row level security;
alter table takedown_requests enable row level security;
alter table malware_scans enable row level security;
alter table blocked_domains enable row level security;

-- Render uses the service-role key and therefore bypasses RLS. Never expose that
-- key in browser code. Add user-scoped RLS policies before connecting Supabase
-- tables directly from the frontend.
