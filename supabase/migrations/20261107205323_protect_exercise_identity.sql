-- Preserve exercise identity at the API boundary, not only through read-only UI fields.
begin;
revoke update on public.exercises from authenticated;
grant update(name, aliases, reference_url) on public.exercises to authenticated;
commit;
