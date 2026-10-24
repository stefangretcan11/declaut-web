begin;

alter table public.subscriptions add column is_pro boolean not null default true;

create table public.billing_invoices (
  id text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  subscription_id text not null,
  status text not null,
  currency text not null check (currency ~ '^[a-z]{3}$'),
  amount_paid bigint not null check (amount_paid >= 0),
  stripe_invoice_number text,
  stripe_hosted_invoice_url text,
  stripe_invoice_pdf_url text,
  fiscal_status text not null default 'pending' check (fiscal_status in ('not_due', 'pending', 'issued', 'failed')),
  fiscal_number text,
  fiscal_pdf_url text,
  created_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index billing_invoices_user_id_idx on public.billing_invoices(user_id, created_at desc);
alter table public.billing_invoices enable row level security;
revoke all on public.billing_invoices from anon, authenticated;
grant select on public.billing_invoices to authenticated;
grant all on public.billing_invoices to service_role;
create policy billing_invoices_read_own on public.billing_invoices for select to authenticated using ((select auth.uid()) = user_id);

create table public.billing_sync_cursors (
  subscription_id text primary key,
  generation bigint not null default 1
);
create table public.billing_webhook_events (
  id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);
create table public.billing_checkout_requests (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  price_id text not null,
  token uuid not null,
  lease_until timestamptz not null,
  session_id text,
  checkout_url text,
  expires_at timestamptz
);
alter table public.billing_sync_cursors enable row level security;
alter table public.billing_webhook_events enable row level security;
alter table public.billing_checkout_requests enable row level security;
revoke all on public.billing_sync_cursors, public.billing_webhook_events, public.billing_checkout_requests from public, anon, authenticated;
grant all on public.billing_sync_cursors, public.billing_webhook_events, public.billing_checkout_requests to service_role;

create function public.bind_billing_customer(p_user_id uuid, p_customer_id text)
returns text language plpgsql security invoker set search_path = '' as $$
declare v_customer text;
begin
  select stripe_customer_id into v_customer from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Profile not found'; end if;
  if v_customer is null then
    update public.profiles set stripe_customer_id = p_customer_id where id = p_user_id;
    v_customer := p_customer_id;
  end if;
  return v_customer;
end;
$$;

create function public.reserve_billing_checkout(p_user_id uuid, p_price_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_request public.billing_checkout_requests; v_token uuid := gen_random_uuid(); v_now timestamptz := clock_timestamp();
begin
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Profile not found'; end if;
  if exists(select 1 from public.subscriptions where user_id = p_user_id and status not in ('canceled', 'incomplete_expired')) then
    return jsonb_build_object('state', 'subscription_exists');
  end if;
  select * into v_request from public.billing_checkout_requests where user_id = p_user_id;
  if found then
    if v_request.checkout_url is not null and v_request.expires_at > v_now then
      if v_request.price_id = p_price_id then return jsonb_build_object('state', 'existing', 'url', v_request.checkout_url); end if;
      return jsonb_build_object('state', 'busy');
    end if;
    if v_request.checkout_url is null and v_request.lease_until > v_now then return jsonb_build_object('state', 'busy'); end if;
  end if;
  insert into public.billing_checkout_requests(user_id, price_id, token, lease_until)
  values(p_user_id, p_price_id, v_token, v_now + interval '2 minutes')
  on conflict(user_id) do update set price_id = excluded.price_id, token = excluded.token, lease_until = excluded.lease_until,
    session_id = null, checkout_url = null, expires_at = null;
  return jsonb_build_object('state', 'reserved', 'token', v_token);
end;
$$;

create function public.finish_billing_checkout(p_user_id uuid, p_token uuid, p_session_id text, p_url text, p_expires_at timestamptz)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.billing_checkout_requests set session_id = p_session_id, checkout_url = p_url, expires_at = p_expires_at
  where user_id = p_user_id and token = p_token;
  return found;
end;
$$;

create function public.release_billing_checkout(p_user_id uuid, p_token uuid)
returns void language sql security invoker set search_path = '' as $$
  delete from public.billing_checkout_requests where user_id = p_user_id and token = p_token and checkout_url is null;
$$;

create function public.begin_billing_sync(p_subscription_id text)
returns bigint language sql security invoker set search_path = '' as $$
  insert into public.billing_sync_cursors(subscription_id, generation) values(p_subscription_id, 1)
  on conflict(subscription_id) do update set generation = public.billing_sync_cursors.generation + 1
  returning generation;
$$;

create function public.apply_billing_sync(p_generation bigint, p_subscription jsonb, p_invoice jsonb default null)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_generation bigint; v_user_id uuid; v_rows integer;
begin
  select generation into v_generation from public.billing_sync_cursors
  where subscription_id = p_subscription->>'id' for update;
  if not found or v_generation <> p_generation then return false; end if;
  select id into v_user_id from public.profiles where stripe_customer_id = p_subscription->>'customer_id' for update;
  if not found then raise exception 'Unknown billing customer'; end if;
  insert into public.subscriptions(id, user_id, status, price_id, current_period_start, current_period_end, cancel_at_period_end, is_pro)
  values(p_subscription->>'id', v_user_id, p_subscription->>'status', p_subscription->>'price_id',
    (p_subscription->>'current_period_start')::timestamptz, (p_subscription->>'current_period_end')::timestamptz,
    (p_subscription->>'cancel_at_period_end')::boolean, (p_subscription->>'is_pro')::boolean)
  on conflict(id) do update set status = excluded.status, price_id = excluded.price_id,
    current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end, is_pro = excluded.is_pro
  where public.subscriptions.user_id = excluded.user_id;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'Subscription owner mismatch'; end if;
  delete from public.billing_checkout_requests where user_id = v_user_id;
  if p_invoice is not null then
    if p_invoice->>'subscription_id' <> p_subscription->>'id' then raise exception 'Invoice subscription mismatch'; end if;
    insert into public.billing_invoices(id, user_id, subscription_id, status, currency, amount_paid, stripe_invoice_number,
      stripe_hosted_invoice_url, stripe_invoice_pdf_url, created_at, fiscal_status)
    values(p_invoice->>'id', v_user_id, p_invoice->>'subscription_id', p_invoice->>'status', p_invoice->>'currency',
      (p_invoice->>'amount_paid')::bigint, p_invoice->>'stripe_invoice_number', p_invoice->>'stripe_hosted_invoice_url',
      p_invoice->>'stripe_invoice_pdf_url', (p_invoice->>'created_at')::timestamptz,
      case when p_invoice->>'status' = 'paid' then 'pending' else 'not_due' end)
    on conflict(id) do update set status = excluded.status, currency = excluded.currency, amount_paid = excluded.amount_paid,
      stripe_invoice_number = excluded.stripe_invoice_number, stripe_hosted_invoice_url = excluded.stripe_hosted_invoice_url,
      stripe_invoice_pdf_url = excluded.stripe_invoice_pdf_url, updated_at = now(),
      fiscal_status = case when public.billing_invoices.fiscal_status in ('issued', 'failed') then public.billing_invoices.fiscal_status else excluded.fiscal_status end
    where public.billing_invoices.user_id = excluded.user_id and public.billing_invoices.subscription_id = excluded.subscription_id;
    get diagnostics v_rows = row_count;
    if v_rows <> 1 then raise exception 'Invoice owner mismatch'; end if;
  end if;
  return true;
end;
$$;

revoke all on function public.bind_billing_customer(uuid, text), public.reserve_billing_checkout(uuid, text),
  public.finish_billing_checkout(uuid, uuid, text, text, timestamptz), public.release_billing_checkout(uuid, uuid),
  public.begin_billing_sync(text), public.apply_billing_sync(bigint, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.bind_billing_customer(uuid, text), public.reserve_billing_checkout(uuid, text),
  public.finish_billing_checkout(uuid, uuid, text, text, timestamptz), public.release_billing_checkout(uuid, uuid),
  public.begin_billing_sync(text), public.apply_billing_sync(bigint, jsonb, jsonb) to service_role;

-- The authoritative plan filter must also apply to desktop licenses. Existing
-- manually managed staging subscriptions default to is_pro=true for A4 fixtures.
create or replace function public.resolve_device_license(p_user_id uuid, p_device_id text, p_device_name text)
returns table (plan text, device_limit_reached boolean, pro_until timestamptz)
language plpgsql security invoker set search_path = '' as $$
declare v_pro_until timestamptz; v_is_allocated boolean; v_now timestamptz;
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
  select exists(select 1 from (select d.device_id from public.devices d where d.user_id = p_user_id order by d.created_at, d.id limit 2) allocated
    where allocated.device_id = p_device_id) into v_is_allocated;
  return query select case when v_is_allocated then 'pro'::text else 'free'::text end, not v_is_allocated,
    case when v_is_allocated then v_pro_until else null::timestamptz end;
end;
$$;

commit;
