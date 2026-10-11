-- Drivers may inspect only providers attached to their own server-issued quotes.
create policy "Drivers read quoted providers" on public.providers for select to authenticated
using ((select public.current_app_role())='driver' and id in (
 select provider_id from public.driver_service_quotes where user_id=(select auth.uid())
));
