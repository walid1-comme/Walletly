-- ===========================================================================
-- Walletly — accounts and subscriptions
--
-- Run this in the Supabase SQL editor AFTER schema.sql.
-- It is safe to run more than once.
--
-- Passwords are never stored here. Supabase Auth keeps them hashed in
-- auth.users and handles login, session refresh and recovery emails. This
-- file only records who someone is and what they have paid for.
-- ===========================================================================

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text unique not null,
  email       text,
  plan        text not null default 'free'
              check (plan in ('free', 'monthly', 'quarterly', 'lifetime')),
  -- null means no paid access. 'lifetime' ignores this column.
  expires_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists profiles_username_idx on public.profiles (lower(username));

alter table public.profiles enable row level security;

-- You can read and edit your own row. Nobody can read anyone else's.
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select using (auth.uid() = id);

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- Nobody can change their own plan from the browser. Only the service role
-- (your Worker, reacting to a payment) or you in the SQL editor can.
revoke update (plan, expires_at) on public.profiles from authenticated, anon;

-- ------------------------------------------ create a profile on sign up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  v_username := coalesce(
    nullif(trim(new.raw_user_meta_data->>'username'), ''),
    split_part(new.email, '@', 1)
  );

  -- Usernames must be unique, so append digits until one is free.
  while exists (select 1 from public.profiles where lower(username) = lower(v_username)) loop
    v_username := v_username || floor(random() * 10)::text;
  end loop;

  insert into public.profiles (id, username, email)
  values (new.id, v_username, new.email)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------- entitlement
-- What the app calls on load to find out who it is talking to.
create or replace function public.my_account()
returns table (
  username   text,
  email      text,
  plan       text,
  expires_at timestamptz,
  active     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.username,
    p.email,
    p.plan,
    p.expires_at,
    (p.plan = 'lifetime' or (p.expires_at is not null and p.expires_at > now()))
  from public.profiles p
  where p.id = auth.uid();
$$;

grant execute on function public.my_account() to authenticated;

-- --------------------------------------------- activate a paid account
-- Called after a payment clears, from the SQL editor or from your Worker
-- using the service role key.
create or replace function public.activate_plan(p_email text, p_plan text)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_current timestamptz;
  v_new     timestamptz;
begin
  select id, expires_at into v_id, v_current
  from public.profiles where lower(email) = lower(p_email);

  if v_id is null then
    raise exception 'No account with email %', p_email;
  end if;

  -- Renewing early extends from the existing date rather than losing time.
  v_new := greatest(coalesce(v_current, now()), now())
           + case p_plan
               when 'monthly'   then interval '1 month'
               when 'quarterly' then interval '3 months'
               else interval '1 month'
             end;

  update public.profiles set plan = p_plan, expires_at = v_new where id = v_id;

  return v_new;
end;
$$;

revoke all on function public.activate_plan(text, text) from anon, authenticated;
grant execute on function public.activate_plan(text, text) to service_role;

-- ===========================================================================
-- GRANT YOURSELF ACCESS
--
-- Sign up inside the app first with your real email, then run this once.
-- It gives that account permanent access with no expiry.
--
--   update public.profiles
--   set plan = 'lifetime', expires_at = null
--   where lower(email) = lower('tadlaouiwalid9@gmail.com');
--
-- To confirm it worked:
--
--   select username, email, plan, expires_at from public.profiles;
-- ===========================================================================
