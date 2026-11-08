begin;

-- A zero-amount trial invoice does not queue fiscal issuance.
create or replace function public.apply_billing_sync(p_generation bigint, p_subscription jsonb, p_invoice jsonb default null)
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
      case when p_invoice->>'status' = 'paid' and (p_invoice->>'amount_paid')::bigint > 0 then 'pending' else 'not_due' end)
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

commit;
