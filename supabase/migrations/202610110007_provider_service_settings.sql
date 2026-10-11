create or replace function public.update_provider_settings(
  target_service_types text[],
  target_active boolean
)
returns public.providers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  updated_provider public.providers;
begin
  if public.current_app_role() <> 'provider' then
    raise exception 'Provider role is required';
  end if;
  if target_service_types is null
     or exists (
       select 1 from unnest(target_service_types) service
       where service not in ('puncture', 'battery', 'towing')
     ) then
    raise exception 'Invalid service type';
  end if;
  if target_active and not exists (
    select 1 from public.providers
    where id = auth.uid() and verification_status = 'approved'
  ) then
    raise exception 'Approved provider status is required to go online';
  end if;

  update public.providers
  set service_types = target_service_types,
      active = target_active,
      updated_at = now()
  where id = auth.uid()
  returning * into updated_provider;

  if updated_provider.id is null then
    raise exception 'Provider profile not found';
  end if;
  return updated_provider;
end;
$$;

revoke all on function public.update_provider_settings(text[], boolean) from public;
grant execute on function public.update_provider_settings(text[], boolean) to authenticated;
