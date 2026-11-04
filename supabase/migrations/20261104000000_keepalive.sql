-- Keep-alive for the free Supabase plan, which pauses a project after 7 days without
-- enough user database activity. A scheduled GitHub Action (.github/workflows/supabase-keepalive.yml)
-- reads one row from this table with the publishable key, which is a real database query.
--
-- Holds no user data. Not part of the PowerSync publication, so phones never sync it.

create table public.keepalive (
  id int primary key,
  pinged_at timestamptz not null default now()
);

insert into public.keepalive (id) values (1);

alter table public.keepalive enable row level security;

create policy "anyone reads keepalive" on public.keepalive for select to anon using (true);

-- Supabase grants anon and authenticated full access to new public tables by default.
-- Keep only what the ping needs: anon may read, nobody else may touch it.
revoke all on public.keepalive from anon, authenticated;
grant select on public.keepalive to anon;
