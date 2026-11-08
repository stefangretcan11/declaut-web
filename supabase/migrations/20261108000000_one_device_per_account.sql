begin;

-- Preserve existing registrations, but allow only one active installation.
alter table public.devices add column is_active boolean not null default false;
with ranked as (
  select id, row_number() over (partition by user_id order by created_at, id) as position
  from public.devices
)
update public.devices d set is_active = ranked.position = 1 from ranked where d.id = ranked.id;
create unique index devices_one_active_per_account on public.devices(user_id) where is_active;

create or replace function public.resolve_device_license(p_user_id uuid, p_device_id text, p_device_name text)
returns table (plan text, device_limit_reached boolean, pro_until timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare v_pro_until timestamptz; v_now timestamptz; v_active_device text;
begin
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Profile does not exist' using errcode = 'P0002'; end if;
  select d.device_id into v_active_device from public.devices d where d.user_id = p_user_id and d.is_active;
  if v_active_device is not null and v_active_device <> p_device_id then
    -- Legacy servers accept only free/pro. This prevents them from signing a
    -- fallback Free token while the API deployment is catching up.
    return query select 'blocked'::text, true, null::timestamptz;
    return;
  end if;
  v_now := clock_timestamp();
  insert into public.devices(user_id, device_id, device_name, last_seen_at, is_active)
  values(p_user_id, p_device_id, p_device_name, v_now, true)
  on conflict(user_id, device_id) do update set device_name = excluded.device_name, last_seen_at = excluded.last_seen_at, is_active = true;
  select max(case when s.status in ('active', 'trialing') then s.current_period_end
    when s.status = 'past_due' then least(s.current_period_end, s.current_period_start + interval '72 hours') end)
  into v_pro_until from public.subscriptions s where s.user_id = p_user_id and s.is_pro
    and s.current_period_start <= v_now and s.current_period_end > v_now
    and (s.status in ('active', 'trialing') or (s.status = 'past_due' and s.current_period_start + interval '72 hours' > v_now));
  if v_pro_until is null then return query select 'free'::text, false, null::timestamptz; return; end if;
  return query select 'pro'::text, false, v_pro_until;
end;
$$;
revoke all on function public.resolve_device_license(uuid, text, text) from public, anon, authenticated;
grant execute on function public.resolve_device_license(uuid, text, text) to service_role;

commit;
