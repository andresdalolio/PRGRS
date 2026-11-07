-- Optional local Supabase pgTAP smoke tests: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(8);
select ok((select bool_and(rowsecurity) from pg_tables where schemaname='public' and tablename in ('profiles','user_roles','coach_athletes','exercises','programs','program_weeks','workout_templates','template_blocks','template_entries','program_assignments','workout_sessions','session_blocks','session_entries','exercise_results','sync_receipts')), 'RLS enabled on all application tables');
select ok(not has_table_privilege('anon','public.workout_sessions','SELECT'), 'Anonymous cannot select workout sessions');
select ok(not has_table_privilege('authenticated','public.user_roles','INSERT'), 'Browser cannot grant roles');
select ok(not has_table_privilege('authenticated','public.exercise_results','UPDATE'), 'Results require checked mutation RPC');
select ok(not has_function_privilege('anon','public.apply_session_mutation(uuid,uuid,integer,jsonb)','EXECUTE'), 'Anonymous cannot invoke logging RPC');
select ok(has_function_privilege('authenticated','public.apply_session_mutation(uuid,uuid,integer,jsonb)','EXECUTE'), 'Authenticated athletes may invoke checked logging RPC');
select ok(not has_column_privilege('authenticated','public.exercises','exercise_key','UPDATE'), 'Stable exercise keys cannot change through API');
select ok(has_column_privilege('authenticated','public.exercises','name','UPDATE'), 'Exercise display details remain editable under RLS');
select * from finish();
rollback;
