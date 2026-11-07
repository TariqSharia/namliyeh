-- Expiry reminders as phone notifications (Web Push).
--
-- How it works: each phone that turns reminders on stores its push address here. Every morning
-- pg_cron calls the "expiry-reminders" edge function, which asks push_due() what expires tomorrow
-- in each home and sends one notification to every member's phone, in that person's language.
--
-- Secrets never leave the server: the VAPID key pair (made by the function on first use) and the
-- cron secret live in private.push_config, a schema the API cannot reach. Only service_role (the
-- edge function) may read them, through the functions below.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.push_config (
  id int primary key default 1 check (id = 1),
  vapid_public text,
  vapid_private text,
  cron_secret text not null default encode(extensions.gen_random_bytes(32), 'hex')
);
insert into private.push_config default values;

-- One row per phone (a push endpoint is one browser on one phone).
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  language text not null default 'ar' check (language in ('ar', 'en')),
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
-- No direct table access at all: phones go through the two functions below.
revoke all on public.push_subscriptions from anon, authenticated;

-- Save this phone's push address for the signed-in user. If the phone was used by another account
-- before, the address moves to the current one (a phone notifies the person signed in on it).
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_language text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, language)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, case when p_language = 'en' then 'en' else 'ar' end)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth, language = excluded.language;
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke all on function public.delete_push_subscription(text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.delete_push_subscription(text) to authenticated;

-- ---------------------------------------------------------------------------
-- For the edge function only (service_role).
-- ---------------------------------------------------------------------------

create or replace function public.push_config()
returns table (vapid_public text, vapid_private text, cron_secret text)
language sql
security definer
set search_path = ''
as $$
  select vapid_public, vapid_private, cron_secret from private.push_config where id = 1;
$$;

-- Stores the key pair once; never replaces an existing one (that would silence every phone).
create or replace function public.push_set_vapid(p_public text, p_private text)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.push_config set vapid_public = p_public, vapid_private = p_private
  where id = 1 and vapid_public is null;
$$;

-- What expires on p_day, per phone: open batches (something left) with that expiry date,
-- in homes the phone's user belongs to. Names in both languages; the function picks one.
create or replace function public.push_due(p_day date)
returns table (endpoint text, p256dh text, auth text, language text, names_ar text[], names_en text[])
language sql
security definer
set search_path = ''
as $$
  with open_batches as (
    select b.household_id, b.item_id
    from public.batches b
    where b.deleted_at is null and b.expiry_date = p_day
      and coalesce((select sum(m.quantity) from public.stock_movements m where m.batch_id = b.id), 0) > 0
  ),
  due as (
    select ob.household_id,
           array_agg(distinct coalesce(i.name_ar, i.name_en)) as names_ar,
           array_agg(distinct coalesce(i.name_en, i.name_ar)) as names_en
    from open_batches ob
    join public.items i on i.id = ob.item_id
    group by ob.household_id
  )
  select s.endpoint, s.p256dh, s.auth, s.language, d.names_ar, d.names_en
  from due d
  join public.household_members hm on hm.household_id = d.household_id
  join public.push_subscriptions s on s.user_id = hm.user_id;
$$;

-- A phone that uninstalled the app or revoked permission: forget it.
create or replace function public.push_forget(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

-- The signed-in user's own phones, for "send a test notification".
create or replace function public.push_mine(p_user uuid)
returns table (endpoint text, p256dh text, auth text, language text)
language sql
security definer
set search_path = ''
as $$
  select endpoint, p256dh, auth, language from public.push_subscriptions where user_id = p_user;
$$;

revoke all on function public.push_config() from public, anon, authenticated;
revoke all on function public.push_set_vapid(text, text) from public, anon, authenticated;
revoke all on function public.push_due(date) from public, anon, authenticated;
revoke all on function public.push_forget(text) from public, anon, authenticated;
revoke all on function public.push_mine(uuid) from public, anon, authenticated;
grant execute on function public.push_config() to service_role;
grant execute on function public.push_set_vapid(text, text) to service_role;
grant execute on function public.push_due(date) to service_role;
grant execute on function public.push_forget(text) to service_role;
grant execute on function public.push_mine(uuid) to service_role;

-- Every morning at 05:00 UTC (07:00 in Palestine and Jordan in winter, 08:00 in summer).
select cron.schedule(
  'expiry-reminders',
  '0 5 * * *',
  $cron$
  select net.http_post(
    url := 'https://emphbteqeuniwshuabbi.supabase.co/functions/v1/expiry-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select cron_secret from private.push_config where id = 1)),
    body := '{}'::jsonb
  );
  $cron$
);
