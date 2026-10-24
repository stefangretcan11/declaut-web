begin;

-- Use the same per-profile lock as license issuance. A concurrent registration
-- and removal cannot reorder slot allocation inside their transactions.
create function public.remove_own_device(p_user_id uuid, p_device_row_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_removed integer;
begin
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then return false; end if;
  delete from public.devices where id = p_device_row_id and user_id = p_user_id;
  get diagnostics v_removed = row_count;
  return v_removed = 1;
end;
$$;
revoke all on function public.remove_own_device(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_own_device(uuid, uuid) to service_role;

commit;
