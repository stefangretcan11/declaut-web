begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  company_name text,
  cui text,
  stripe_customer_id text unique,
  terms_accepted_at timestamptz,
  terms_version text,
  created_at timestamptz not null default now()
);

create table public.subscriptions (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null check (status in ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused')),
  price_id text not null,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now(),
  check (current_period_end > current_period_start)
);
create index subscriptions_user_id_idx on public.subscriptions(user_id);

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  device_id text not null check (char_length(device_id) between 1 and 128),
  device_name text not null check (char_length(device_name) between 1 and 120),
  created_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, device_id)
);
create index devices_allocation_idx on public.devices(user_id, created_at, id);

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.devices enable row level security;

revoke all on table public.profiles, public.subscriptions, public.devices from anon, authenticated;
grant select on table public.profiles, public.subscriptions, public.devices to authenticated;
grant all on table public.profiles, public.subscriptions, public.devices to service_role;

create policy profiles_read_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy subscriptions_read_own on public.subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy devices_read_own on public.devices for select to authenticated using ((select auth.uid()) = user_id);

create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, company_name, cui)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'company_name', new.raw_user_meta_data ->> 'cui');
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Include accounts created before this migration was deployed.
insert into public.profiles (id, email, company_name, cui)
select id, coalesce(email, ''), raw_user_meta_data ->> 'company_name', raw_user_meta_data ->> 'cui' from auth.users
on conflict (id) do nothing;

create function public.set_subscription_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.set_subscription_updated_at() from public, anon, authenticated;
create trigger subscriptions_updated_at before update on public.subscriptions
for each row execute function public.set_subscription_updated_at();

-- Only the backend may call this function. Keep device registration, slot
-- selection, and subscription evaluation in one transaction per account.
create function public.resolve_device_license(p_user_id uuid, p_device_id text, p_device_name text)
returns table (plan text, device_limit_reached boolean, pro_until timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare
  v_pro_until timestamptz;
  v_is_allocated boolean;
  v_now timestamptz;
begin
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'Profile does not exist' using errcode = 'P0002';
  end if;

  v_now := clock_timestamp();
  insert into public.devices (user_id, device_id, device_name, last_seen_at)
  values (p_user_id, p_device_id, p_device_name, v_now)
  on conflict (user_id, device_id) do update
  set device_name = excluded.device_name, last_seen_at = excluded.last_seen_at;

  select max(case
    when s.status in ('active', 'trialing') then s.current_period_end
    when s.status = 'past_due' then least(s.current_period_end, s.current_period_start + interval '72 hours')
  end) into v_pro_until
  from public.subscriptions s
  where s.user_id = p_user_id
    and s.current_period_start <= v_now
    and s.current_period_end > v_now
    and (s.status in ('active', 'trialing')
      or (s.status = 'past_due' and s.current_period_start + interval '72 hours' > v_now));

  if v_pro_until is null then
    return query select 'free'::text, false, null::timestamptz;
    return;
  end if;

  select exists (
    select 1 from (
      select d.device_id from public.devices d where d.user_id = p_user_id
      order by d.created_at, d.id limit 2
    ) allocated where allocated.device_id = p_device_id
  ) into v_is_allocated;

  return query select
    case when v_is_allocated then 'pro'::text else 'free'::text end,
    not v_is_allocated,
    case when v_is_allocated then v_pro_until else null::timestamptz end;
end;
$$;
revoke all on function public.resolve_device_license(uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_device_license(uuid, text, text) to service_role;

commit;
