begin;

-- Record the server timestamp and the actual terms version accepted at signup.
-- Existing profiles are left untouched; no consent is invented retroactively.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, company_name, cui, terms_accepted_at, terms_version)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'company_name',
    new.raw_user_meta_data ->> 'cui',
    case when new.raw_user_meta_data ->> 'terms_accepted' = 'true'
      and new.raw_user_meta_data ->> 'terms_version' = '2026-10-24-staging' then clock_timestamp() end,
    case when new.raw_user_meta_data ->> 'terms_accepted' = 'true'
      and new.raw_user_meta_data ->> 'terms_version' = '2026-10-24-staging' then '2026-10-24-staging' end
  );
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;

commit;
