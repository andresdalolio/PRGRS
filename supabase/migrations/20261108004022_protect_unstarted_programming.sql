begin;
create or replace function public.apply_session_mutation(p_id uuid,p_session uuid,p_base_version integer,p_log jsonb) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
 declare s public.workout_sessions;r jsonb;ack public.sync_receipts;count_entries integer;count_payload integer;
 begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 -- Serialize mutations for the session, including duplicate requests.
 select * into s from public.workout_sessions where id=p_session and athlete_id=auth.uid() for update;
 if s.id is null then raise exception 'Workout unavailable';end if;
 select * into ack from public.sync_receipts where mutation_id=p_id;
 if ack.mutation_id is not null then
 if ack.athlete_id<>auth.uid() or ack.session_id<>p_session then raise exception 'Mutation ID belongs to another operation';end if;
 return ack.version;end if;
 if s.deleted then raise exception 'VERSION_CONFLICT: workout was deleted. Export local edits before accepting the deletion';end if;
 if s.version is distinct from p_base_version then raise exception 'VERSION_CONFLICT: server version %; local base %',s.version,p_base_version;end if;
 if p_log ? 'deleted' and jsonb_typeof(p_log->'deleted') is distinct from 'boolean' then raise exception 'Invalid deletion flag';end if;
 if p_log->'deleted'='true'::jsonb then
   -- Athlete history deletion must never remove untouched programming, even through an old client.
   if s.status not in ('finished','skipped') and not exists (
     select 1 from public.exercise_results r join public.session_entries e on e.id=r.entry_id
     join public.session_blocks b on b.id=e.block_id
     where b.session_id=s.id and e.eligible and (r.completed or btrim(r.load)<>'' or btrim(r.notes)<>'')
   ) then raise exception 'VERSION_CONFLICT: Unstarted programming cannot be deleted from history';end if;
   delete from public.exercise_results where entry_id in (select e.id from public.session_entries e join public.session_blocks b on b.id=e.block_id where b.session_id=s.id);
   delete from public.session_entries where block_id in (select id from public.session_blocks where session_id=s.id);
   delete from public.session_blocks where session_id=s.id;
   update public.workout_sessions set deleted=true,status='scheduled',finished_at=null,version=version+1,updated_at=now() where id=s.id;
   insert into public.sync_receipts(mutation_id,athlete_id,session_id,version) values(p_id,auth.uid(),s.id,s.version+1);
   return s.version+1;
 end if;
 if coalesce(p_log->>'status','') not in ('scheduled','in_progress','finished','skipped') or jsonb_typeof(p_log->'results') is distinct from 'array' then raise exception 'Invalid workout log';end if;
 if (p_log->>'status'='finished') is distinct from (p_log->>'finishedAt' is not null) then raise exception 'Finished timestamp must match status';end if;
 select count(*) into count_entries from public.session_entries e join public.session_blocks b on b.id=e.block_id where b.session_id=s.id;
 count_payload=jsonb_array_length(p_log->'results');
 if count_payload<>count_entries or (select count(distinct x->>'entryId') from jsonb_array_elements(p_log->'results') x)<>count_entries then raise exception 'Log must contain each session entry exactly once';end if;
 for r in select value from jsonb_array_elements(p_log->'results') loop
 if jsonb_typeof(r->'completed') is distinct from 'boolean' or jsonb_typeof(r->'load') is distinct from 'string' or jsonb_typeof(r->'notes') is distinct from 'string' then raise exception 'Invalid result';end if;
 if not exists(select 1 from public.session_entries e join public.session_blocks b on b.id=e.block_id where e.id=(r->>'entryId')::uuid and b.session_id=s.id and (e.eligible or not (r->>'completed')::boolean)) then raise exception 'Invalid entry or instruction-only completion';end if;
 if not (r->>'completed')::boolean and btrim(r->>'load')='' and btrim(r->>'notes')='' then
 delete from public.exercise_results where entry_id=(r->>'entryId')::uuid;
 else
 insert into public.exercise_results(entry_id,completed,load,notes) values((r->>'entryId')::uuid,(r->>'completed')::boolean,r->>'load',r->>'notes') on conflict(entry_id) do update set completed=excluded.completed,load=excluded.load,notes=excluded.notes,updated_at=now();
 end if;
 end loop;
 update public.workout_sessions set status=p_log->>'status',finished_at=(p_log->>'finishedAt')::timestamptz,version=version+1,updated_at=now() where id=s.id;
 insert into public.sync_receipts(mutation_id,athlete_id,session_id,version) values(p_id,auth.uid(),s.id,s.version+1);
 return s.version+1;end
$$;

commit;
