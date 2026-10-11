-- Driver availability reports can be reviewed by admins.

create or replace function public.moderate_availability_report(
  target_report_id uuid,
  target_status text
)
returns public.availability_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  moderated public.availability_reports;
begin
  if not public.is_admin() then
    raise exception 'Admin role is required';
  end if;
  if target_status not in ('approved', 'rejected') then
    raise exception 'Unsupported moderation status';
  end if;

  update public.availability_reports
  set moderation_status = target_status
  where id = target_report_id
    and moderation_status = 'pending'
  returning * into moderated;

  if moderated.id is null then
    raise exception 'Report is no longer pending';
  end if;
  return moderated;
end;
$$;

revoke all on function public.moderate_availability_report(uuid, text) from public;
grant execute on function public.moderate_availability_report(uuid, text) to authenticated;
