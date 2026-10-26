begin;

-- Every registered device inherits the account's subscription entitlement.
-- Keep the legacy RPC flag false so older deployed servers can still read it.
create or replace function public.resolve_device_license(p_user_id uuid, p_device_id text, p_device_name text)
returns table (plan text, device_limit_reached boolean, pro_until timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare v_pro_until timestamptz; v_now timestamptz;
begin
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Profile does not exist' using errcode = 'P0002'; end if;
  v_now := clock_timestamp();
  insert into public.devices(user_id, device_id, device_name, last_seen_at)
  values(p_user_id, p_device_id, p_device_name, v_now)
  on conflict(user_id, device_id) do update set device_name = excluded.device_name, last_seen_at = excluded.last_seen_at;
  select max(case when s.status in ('active', 'trialing') then s.current_period_end
    when s.status = 'past_due' then least(s.current_period_end, s.current_period_start + interval '72 hours') end)
  into v_pro_until from public.subscriptions s where s.user_id = p_user_id and s.is_pro
    and s.current_period_start <= v_now and s.current_period_end > v_now
    and (s.status in ('active', 'trialing') or (s.status = 'past_due' and s.current_period_start + interval '72 hours' > v_now));
  if v_pro_until is null then return query select 'free'::text, false, null::timestamptz; return; end if;
  return query select 'pro'::text, false, v_pro_until;
end;
$$;

commit;
