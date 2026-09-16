-- ===========================================================================
-- Walletly — allowlist registry
-- Run this FIRST in the Supabase SQL editor, then auth-schema.sql.
--
-- Design rule: the `entries` table is never readable directly. The only way
-- to learn anything is check_allowlists(), which returns rows exclusively for
-- addresses the caller already supplied. A project's list can therefore never
-- be enumerated or scraped, which is the condition projects need before they
-- will hand over their allowlists.
-- ===========================================================================

create extension if not exists "pgcrypto";

create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  chain       text,
  twitter     text,
  mint_date   date,
  verified    boolean not null default false,
  owner_email text,
  created_at  timestamptz not null default now()
);

create table if not exists public.lists (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null,
  published  boolean not null default true,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create table if not exists public.entries (
  list_id uuid not null references public.lists(id) on delete cascade,
  address text not null check (address ~ '^0x[0-9a-f]{40}$'),
  tier    text,
  primary key (list_id, address)
);

-- The lookup index that makes a 16k-row list check instant.
create index if not exists entries_address_idx on public.entries (address);
create index if not exists lists_project_idx   on public.lists (project_id);

create table if not exists public.submissions (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  list_id    uuid references public.lists(id) on delete set null,
  row_count  integer not null default 0,
  source     text,
  created_at timestamptz not null default now()
);

alter table public.projects    enable row level security;
alter table public.lists       enable row level security;
alter table public.entries     enable row level security;
alter table public.submissions enable row level security;

-- The public project directory is readable. Everything else is closed.
drop policy if exists "projects are public" on public.projects;
create policy "projects are public" on public.projects for select using (true);

drop function if exists public.check_allowlists(text[]);
create function public.check_allowlists(p_addresses text[])
returns table (
  address      text,
  project_name text,
  project_slug text,
  list_name    text,
  tier         text,
  mint_date    date,
  verified     boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select e.address, p.name, p.slug, l.name, e.tier, p.mint_date, p.verified
  from public.entries e
  join public.lists    l on l.id = e.list_id
  join public.projects p on p.id = l.project_id
  where l.published
    and e.address = any (select lower(a) from unnest(p_addresses) as a)
  limit 2000;
$$;

drop function if exists public.publish_list(text, text, text, text, date, text, jsonb);
create function public.publish_list(
  p_project_slug text,
  p_project_name text,
  p_chain        text,
  p_twitter      text,
  p_mint_date    date,
  p_list_name    text,
  p_entries      jsonb
)
returns table (list_id uuid, inserted integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_list_id    uuid;
  v_count      integer;
begin
  insert into public.projects (slug, name, chain, twitter, mint_date)
  values (lower(p_project_slug), p_project_name, p_chain, p_twitter, p_mint_date)
  on conflict (slug) do update
    set name      = excluded.name,
        chain     = coalesce(excluded.chain, public.projects.chain),
        twitter   = coalesce(excluded.twitter, public.projects.twitter),
        mint_date = coalesce(excluded.mint_date, public.projects.mint_date)
  returning id into v_project_id;

  insert into public.lists (project_id, name)
  values (v_project_id, p_list_name)
  on conflict (project_id, name) do update set published = true
  returning id into v_list_id;

  -- Replace the list contents so a re-upload is idempotent.
  delete from public.entries where entries.list_id = v_list_id;

  insert into public.entries (list_id, address, tier)
  select v_list_id, lower(item->>'address'), nullif(item->>'tier', '')
  from jsonb_array_elements(p_entries) as item
  where lower(item->>'address') ~ '^0x[0-9a-f]{40}$'
  on conflict do nothing;

  get diagnostics v_count = row_count;

  insert into public.submissions (project_id, list_id, row_count, source)
  values (v_project_id, v_list_id, v_count, 'api');

  return query select v_list_id, v_count;
end;
$$;

revoke all on function public.check_allowlists(text[]) from anon;
revoke all on function public.publish_list(text, text, text, text, date, text, jsonb) from anon, authenticated;
grant execute on function public.check_allowlists(text[]) to service_role;
grant execute on function public.publish_list(text, text, text, text, date, text, jsonb) to service_role;
