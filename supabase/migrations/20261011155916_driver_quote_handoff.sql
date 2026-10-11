-- Preserve the provider workflow while allowing the quoted provider to accept.
create or replace function public.claim_service_request(target_request_id uuid)
returns public.service_requests language plpgsql security definer
set search_path = public, pg_temp as $$
declare claimed public.service_requests;
begin
  if public.current_app_role() <> 'provider' then raise exception 'Provider role is required'; end if;
  update public.service_requests sr
  set assigned_provider_id=auth.uid(),status='confirmed',updated_at=now()
  where sr.id=target_request_id and sr.status='requested'
    and (sr.assigned_provider_id is null or (sr.quote_id is not null and sr.assigned_provider_id=auth.uid()))
    and exists (select 1 from public.providers p where p.id=auth.uid() and p.verification_status='approved' and p.active and sr.service_type=any(p.service_types))
    and not exists (select 1 from public.service_request_provider_declines d where d.request_id=sr.id and d.provider_id=auth.uid())
  returning sr.* into claimed;
  if claimed.id is null then raise exception 'Request is no longer available'; end if;
  return claimed;
end;
$$;

create or replace function public.decline_service_request(target_request_id uuid)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if public.current_app_role() <> 'provider' then raise exception 'Provider role is required'; end if;
  if not exists (
    select 1 from public.service_requests sr join public.providers p on p.id=auth.uid()
    where sr.id=target_request_id and sr.status='requested'
      and (sr.assigned_provider_id is null or (sr.quote_id is not null and sr.assigned_provider_id=auth.uid()))
      and p.verification_status='approved' and p.active and sr.service_type=any(p.service_types)
  ) then raise exception 'Request is no longer available'; end if;
  insert into public.service_request_provider_declines(request_id,provider_id) values(target_request_id,auth.uid()) on conflict do nothing;
  -- A declined, specifically quoted request cannot be handed to a different provider.
  update public.service_requests set status='cancelled',updated_at=now()
  where id=target_request_id and quote_id is not null and assigned_provider_id=auth.uid() and status='requested';
end;
$$;
