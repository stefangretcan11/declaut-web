begin;

-- Retire only recognizable synthetic staging entitlements. Keep the records so
-- this transition is auditable; actual customer subscriptions are untouched.
update public.subscriptions s set is_pro=false,updated_at=clock_timestamp()
from public.profiles p where p.id=s.user_id and p.email like '%@example.invalid'
  and s.price_id in ('price_smoke_only','price_manual_account_fixture','price_manual_demo','price_fixture','price_test');

create table public.account_consents (
  user_id uuid not null references public.profiles(id) on delete cascade,
  version text not null,
  accepted_at timestamptz not null,
  primary key(user_id,version)
);
alter table public.account_consents enable row level security;
revoke all on public.account_consents from public,anon,authenticated;
grant select on public.account_consents to authenticated;
grant all on public.account_consents to service_role;
create policy account_consents_read_own on public.account_consents for select to authenticated using ((select auth.uid())=user_id);
insert into public.account_consents(user_id,version,accepted_at)
select id,terms_version,terms_accepted_at from public.profiles where terms_version is not null and terms_accepted_at is not null;

-- Keep historical staging consent and record the production agreement separately.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_terms text;
begin
  if new.raw_user_meta_data ->> 'terms_accepted' = 'true'
    and new.raw_user_meta_data ->> 'terms_version' in ('2026-10-24-staging', '2026-11-08-production') then
    v_terms := new.raw_user_meta_data ->> 'terms_version';
  end if;
  insert into public.profiles(id,email,company_name,cui,terms_accepted_at,terms_version)
  values(new.id,coalesce(new.email,''),new.raw_user_meta_data ->> 'company_name',new.raw_user_meta_data ->> 'cui',
    case when v_terms is not null then clock_timestamp() end,v_terms);
  if v_terms is not null then
    insert into public.account_consents(user_id,version,accepted_at)
    select id,terms_version,terms_accepted_at from public.profiles where id=new.id;
  end if;
  return new;
end;
$$;

create function public.accept_account_terms(p_user_id uuid,p_version text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_version not in ('2026-10-24-staging','2026-11-08-production') or p_version is null then raise exception 'Unknown terms version'; end if;
  perform 1 from public.profiles where id=p_user_id for update;
  if not found then raise exception 'Profile not found'; end if;
  insert into public.account_consents(user_id,version,accepted_at) values(p_user_id,p_version,clock_timestamp()) on conflict do nothing;
  update public.profiles p set terms_version=p_version,terms_accepted_at=c.accepted_at from public.account_consents c
  where p.id=p_user_id and c.user_id=p_user_id and c.version=p_version;
end;
$$;

alter table public.billing_invoices add column fiscal_issue_date date;
alter table public.billing_invoices add column fiscal_retry_after timestamptz not null default now();
alter table public.billing_invoices add column fiscal_attempts integer not null default 0 check(fiscal_attempts>=0);

create function public.claim_fiscal_invoice_date(p_invoice_id text, p_user_id uuid)
returns date language plpgsql security invoker set search_path = '' as $$
declare v_date date;
begin
  update public.billing_invoices set fiscal_issue_date=coalesce(fiscal_issue_date,(clock_timestamp() at time zone 'Europe/Bucharest')::date),
    fiscal_retry_after=clock_timestamp()+interval '1 hour',fiscal_attempts=fiscal_attempts+1
  where id=p_invoice_id and user_id=p_user_id and status='paid' and amount_paid>0
  returning fiscal_issue_date into v_date;
  if not found then raise exception 'Fiscal invoice unavailable'; end if;
  return v_date;
end;
$$;

create function public.complete_fiscal_invoice(p_invoice_id text, p_user_id uuid, p_number text, p_url text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_invoice public.billing_invoices;
begin
  select * into v_invoice from public.billing_invoices where id=p_invoice_id and user_id=p_user_id for update;
  if not found or v_invoice.status <> 'paid' or v_invoice.amount_paid <= 0 or v_invoice.fiscal_issue_date is null then return false; end if;
  if v_invoice.fiscal_status = 'issued' then return v_invoice.fiscal_number=p_number and v_invoice.fiscal_pdf_url=p_url; end if;
  if p_number is null or length(trim(p_number))=0 or p_url is null or p_url !~ '^https://(www\.)?oblio\.eu/' then return false; end if;
  update public.billing_invoices set fiscal_status='issued', fiscal_number=p_number, fiscal_pdf_url=p_url,updated_at=clock_timestamp()
    where id=p_invoice_id and user_id=p_user_id;
  return true;
end;
$$;
revoke all on function public.handle_new_user(), public.accept_account_terms(uuid,text), public.claim_fiscal_invoice_date(text,uuid), public.complete_fiscal_invoice(text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.accept_account_terms(uuid,text), public.claim_fiscal_invoice_date(text,uuid), public.complete_fiscal_invoice(text,uuid,text,text) to service_role;

commit;
