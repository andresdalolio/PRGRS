-- Remove reusable programming and assignments without losing logs or offline mutation targets.
begin;

alter table public.workout_sessions
 alter column assignment_id drop not null,
 drop constraint workout_sessions_assignment_id_fkey,
 add constraint workout_sessions_assignment_id_fkey
   foreign key (assignment_id) references public.program_assignments(id) on delete set null,
 add column withdrawn_at timestamptz;
create index workout_sessions_assignment_idx on public.workout_sessions(assignment_id);

create function public.remove_program(p_program uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if auth.uid() is null or not public.has_role('coach') then
   raise exception 'Coach capability required';
 end if;

 -- Match save/assign's lock so these operations cannot race with removal.
 perform 1 from public.programs where id=p_program and owner_id=auth.uid() for update;
 if not found then raise exception 'Program unavailable';end if;

 -- Serialize against athlete mutations before deciding which snapshots leave the schedule.
 perform s.id from public.workout_sessions s
 join public.program_assignments a on a.id=s.assignment_id
 where a.program_id=p_program order by s.id for update of s;

 update public.workout_sessions s set withdrawn_at=now()
 from public.program_assignments a, public.profiles athlete
 where s.assignment_id=a.id and a.program_id=p_program and athlete.id=s.athlete_id
   and s.status='scheduled' and s.version=0
   and s.scheduled_date >= (now() at time zone athlete.timezone)::date;

 -- Snapshots detach through SET NULL. Their IDs, results, versions and receipts survive.
 delete from public.program_assignments where program_id=p_program;
 delete from public.programs where id=p_program;
end
$$;
revoke execute on function public.remove_program(uuid) from public,anon,authenticated;
grant execute on function public.remove_program(uuid) to authenticated;

-- A withdrawn snapshot becomes visible again when an offline log is acknowledged.
create or replace function public.get_my_sessions() returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'athleteId',s.athlete_id,'assignmentId',s.assignment_id,'date',s.scheduled_date,'title',s.title,'description',s.description,'category',s.category,'estimatedMinutes',s.estimated_minutes,'status',s.status,'finishedAt',s.finished_at,'version',s.version,'updatedAt',s.updated_at,'blocks',coalesce((
 select jsonb_agg(jsonb_build_object('id',b.id,'label',b.label,'kind',b.kind,'instructions',b.instructions,'entries',coalesce((
 select jsonb_agg(jsonb_build_object('id',e.id,'exerciseId',e.exercise_id,'name',e.name,'label',e.label,'eligible',e.eligible,'referenceUrl',e.reference_url,'prescription',e.prescription,'instructions',e.instructions,'completed',coalesce(r.completed,false),'load',coalesce(r.load,''),'notes',coalesce(r.notes,'')) order by e.position)
 from public.session_entries e left join public.exercise_results r on r.entry_id=e.id where e.block_id=b.id),'[]'::jsonb)) order by b.position)
 from public.session_blocks b where b.session_id=s.id),'[]'::jsonb)) order by s.scheduled_date,s.id),'[]'::jsonb) from public.workout_sessions s
 where s.withdrawn_at is null or s.version>0 or s.status<>'scheduled'
$$;

commit;
