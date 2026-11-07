-- Evaluate request identity once per statement while preserving every ownership predicate.
-- No training rows, grants, or snapshot structures change.
begin;
alter policy profiles_read on public.profiles using (id=(select auth.uid()) or public.can_read_athlete(id) or exists(select 1 from public.coach_athletes where athlete_id=(select auth.uid()) and coach_id=profiles.id));
alter policy profiles_update on public.profiles using(id=(select auth.uid())) with check(id=(select auth.uid()));
alter policy roles_read on public.user_roles using(user_id=(select auth.uid()));
alter policy relationships_read on public.coach_athletes using(coach_id=(select auth.uid()) or athlete_id=(select auth.uid()));
alter policy exercises_read on public.exercises using(owner_id=(select auth.uid()) or exists(select 1 from public.session_entries e join public.session_blocks b on b.id=e.block_id join public.workout_sessions s on s.id=b.session_id where e.exercise_id=exercises.id and public.can_read_athlete(s.athlete_id)));
alter policy exercises_insert on public.exercises with check(owner_id=(select auth.uid()) and (select public.has_role('coach')));
alter policy exercises_update on public.exercises using(owner_id=(select auth.uid()) and (select public.has_role('coach'))) with check(owner_id=(select auth.uid()) and (select public.has_role('coach')));
alter policy programs_read on public.programs using(owner_id=(select auth.uid()));
alter policy weeks_read on public.program_weeks using(exists(select 1 from public.programs where id=program_id and owner_id=(select auth.uid())));
alter policy templates_read on public.workout_templates using(exists(select 1 from public.program_weeks w join public.programs p on p.id=w.program_id where w.id=week_id and p.owner_id=(select auth.uid())));
alter policy receipts_read on public.sync_receipts using(athlete_id=(select auth.uid()));
commit;
