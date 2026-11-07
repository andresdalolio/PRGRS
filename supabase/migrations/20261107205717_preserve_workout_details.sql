-- Add optional workout details to reusable templates and immutable assignment snapshots.
begin;
alter table public.workout_templates
 add column description text not null default '' check(length(description)<=2000),
 add column category text not null default '' check(length(category)<=80),
 add column estimated_minutes integer check(estimated_minutes between 1 and 1440);
alter table public.workout_sessions
 add column description text not null default '' check(length(description)<=2000),
 add column category text not null default '' check(length(category)<=80),
 add column estimated_minutes integer check(estimated_minutes between 1 and 1440);
create or replace function public.validate_program(p jsonb) returns void language plpgsql set search_path=public,pg_temp as $$
 declare w jsonb;d jsonb;b jsonb;e jsonb;v jsonb;k text;seen integer[]='{}';
 begin
 if jsonb_typeof(p)<>'object' or (p->>'schemaVersion') is distinct from '1' or coalesce(length(trim(p->>'name')),0) not between 1 and 160 or coalesce(length(p->>'description'),0)>2000 or jsonb_typeof(p->'weeks') is distinct from 'array' then raise exception 'Invalid program header';end if;
 if jsonb_array_length(p->'weeks') not between 1 and 52 then raise exception 'Expected 1–52 weeks';end if;
 for w in select value from jsonb_array_elements(p->'weeks') loop
 if (w->>'week') !~ '^[0-9]+$' or (w->>'week') is null or (w->>'week')::integer not between 1 and 52 or (w->>'week')::integer=any(seen) or jsonb_typeof(w->'workouts') is distinct from 'array' then raise exception 'Invalid or duplicate week';end if;
 seen=array_append(seen,(w->>'week')::integer);
 if jsonb_array_length(w->'workouts')>21 then raise exception 'Too many workouts';end if;
 for d in select value from jsonb_array_elements(w->'workouts') loop
 if (d->>'day') is null or (d->>'day') !~ '^[1-7]$' or coalesce(length(trim(d->>'title')),0) not between 1 and 160 or jsonb_typeof(d->'blocks') is distinct from 'array' then raise exception 'Invalid workout';end if;
 if d ? 'description' and (jsonb_typeof(d->'description') is distinct from 'string' or length(d->>'description')>2000) then raise exception 'Invalid workout description';end if;
 if d ? 'category' and (jsonb_typeof(d->'category') is distinct from 'string' or length(d->>'category')>80) then raise exception 'Invalid workout category';end if;
 if d ? 'estimatedMinutes' and (jsonb_typeof(d->'estimatedMinutes') is distinct from 'number' or (d->>'estimatedMinutes') !~ '^[0-9]+$' or (d->>'estimatedMinutes')::integer not between 1 and 1440) then raise exception 'Invalid workout duration';end if;
 if jsonb_array_length(d->'blocks') not between 1 and 30 then raise exception 'Expected 1–30 blocks';end if;
 for b in select value from jsonb_array_elements(d->'blocks') loop
 if coalesce(b->>'kind','') not in ('single','superset','circuit','emom','amrap','for_time','warmup','cooldown','instruction') or coalesce(length(b->>'label'),100)>12 or coalesce(length(b->>'instructions'),0)>2000 or jsonb_typeof(b->'entries') is distinct from 'array' then raise exception 'Invalid block';end if;
 if jsonb_array_length(b->'entries')>50 then raise exception 'Too many entries';end if;
 for e in select value from jsonb_array_elements(b->'entries') loop
 if coalesce(e->>'exerciseKey','') !~ '^[a-z0-9][a-z0-9-]{0,79}$' or coalesce(length(trim(e->>'name')),0) not between 1 and 160 or coalesce(length(e->>'label'),100)>12 or coalesce(length(e->>'instructions'),0)>2000 then raise exception 'Invalid exercise identity';end if;
 if e ? 'eligible' and jsonb_typeof(e->'eligible')<>'boolean' then raise exception 'Invalid eligibility';end if;
 if b->>'kind'='instruction' and coalesce((e->>'eligible')::boolean,true) then raise exception 'Instruction entries cannot count toward completion';end if;
 if e ? 'referenceUrl' and (coalesce(e->>'referenceUrl','') !~ '^https?://[^ /]+' or length(e->>'referenceUrl')>2000) then raise exception 'Invalid reference URL';end if;
 if e ? 'aliases' then
 if jsonb_typeof(e->'aliases')<>'array' or jsonb_array_length(e->'aliases')>20 then raise exception 'Invalid aliases';end if;
 for v in select value from jsonb_array_elements(e->'aliases') loop if jsonb_typeof(v)<>'string' or length(v#>>'{}') not between 1 and 100 then raise exception 'Invalid alias';end if;end loop;end if;
 if e ? 'prescription' then
 if jsonb_typeof(e->'prescription')<>'object' then raise exception 'Invalid prescription';end if;
 for k,v in select key,value from jsonb_each(e->'prescription') loop
 if k in ('sets','calories','rounds') then if jsonb_typeof(v)<>'number' or (v#>>'{}') !~ '^[0-9]+$' or (v#>>'{}')::integer not between 1 and (case k when 'sets' then 100 when 'rounds' then 1000 else 10000 end) then raise exception 'Invalid numeric prescription';end if;
 elsif k in ('reps','load','duration','distance','tempo','rest','text') then if jsonb_typeof(v)<>'string' or length(v#>>'{}')>2000 then raise exception 'Invalid prescription text';end if;
 else raise exception 'Unknown prescription field';end if;end loop;end if;
 end loop;end loop;end loop;end loop;
 end
$$;

create or replace function public.save_program(p_program jsonb,p_replace uuid default null) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
 declare pid uuid;wid uuid;did uuid;bid uuid;eid uuid;w jsonb;d jsonb;b jsonb;e jsonb;dp integer;bp integer;ep integer;
 begin
 if auth.uid() is null or not public.has_role('coach') then raise exception 'Coach capability required';end if;
 perform public.validate_program(p_program);
 if p_replace is null then insert into public.programs(owner_id,name,description,checksum) values(auth.uid(),p_program->>'name',coalesce(p_program->>'description',''),md5(p_program::text)) returning id into pid;
 else
 select id into pid from public.programs where id=p_replace and owner_id=auth.uid() for update;
 if pid is null then raise exception 'Program unavailable';end if;
 update public.programs set name=p_program->>'name',description=coalesce(p_program->>'description',''),checksum=md5(p_program::text),version=version+1,updated_at=now() where id=pid;
 delete from public.program_weeks where program_id=pid;
 end if;
 for w in select value from jsonb_array_elements(p_program->'weeks') loop
 insert into public.program_weeks(program_id,week_number) values(pid,(w->>'week')::integer) returning id into wid;dp=0;
 for d in select value from jsonb_array_elements(w->'workouts') loop
 insert into public.workout_templates(week_id,day,position,title,description,category,estimated_minutes) values(wid,(d->>'day')::integer,dp,d->>'title',coalesce(d->>'description',''),coalesce(d->>'category',''),(d->>'estimatedMinutes')::integer) returning id into did;dp=dp+1;bp=0;
 for b in select value from jsonb_array_elements(d->'blocks') loop
 insert into public.template_blocks(workout_id,position,label,kind,instructions) values(did,bp,b->>'label',b->>'kind',coalesce(b->>'instructions','')) returning id into bid;bp=bp+1;ep=0;
 for e in select value from jsonb_array_elements(b->'entries') loop
 insert into public.exercises(owner_id,exercise_key,name,aliases,reference_url) values(auth.uid(),e->>'exerciseKey',e->>'name',array(select jsonb_array_elements_text(coalesce(e->'aliases','[]'))),e->>'referenceUrl') on conflict(owner_id,exercise_key) do nothing;
 select id into eid from public.exercises where owner_id=auth.uid() and exercise_key=e->>'exerciseKey';
 insert into public.template_entries(block_id,exercise_id,position,label,eligible,prescription,instructions) values(bid,eid,ep,e->>'label',coalesce((e->>'eligible')::boolean,true),coalesce(e->'prescription','{}'),coalesce(e->>'instructions',''));ep=ep+1;
 end loop;end loop;end loop;end loop;
 return pid;
 exception when unique_violation then raise exception 'Duplicate program content. Open the existing program to edit or assign it.';
 end
$$;

create or replace function public.assign_program(p_program uuid,p_athlete uuid,p_start date) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
 declare aid uuid;sid uuid;bid uuid;p public.programs;d record;b record;
 begin
 if auth.uid() is null or not public.has_role('coach') then raise exception 'Coach capability required';end if;
 if p_athlete<>auth.uid() and not exists(select 1 from public.coach_athletes where coach_id=auth.uid() and athlete_id=p_athlete and accepted) then raise exception 'Athlete must accept coaching first';end if;
 if not exists(select 1 from public.user_roles where user_id=p_athlete and role='athlete') then raise exception 'Athlete capability required';end if;
 select * into p from public.programs where id=p_program and owner_id=auth.uid() for update;
 if p.id is null then raise exception 'Program unavailable';end if;
 if p_start is null then raise exception 'Start date required';end if;
 insert into public.program_assignments(program_id,program_version,coach_id,athlete_id,start_date) values(p.id,p.version,auth.uid(),p_athlete,p_start) returning id into aid;
 for d in select t.*,w.week_number from public.workout_templates t join public.program_weeks w on w.id=t.week_id where w.program_id=p.id order by w.week_number,t.position loop
 insert into public.workout_sessions(assignment_id,athlete_id,template_id,scheduled_date,title,description,category,estimated_minutes) values(aid,p_athlete,d.id,p_start+((d.week_number-1)*7+d.day-1),d.title,d.description,d.category,d.estimated_minutes) returning id into sid;
 for b in select * from public.template_blocks where workout_id=d.id order by position loop
 insert into public.session_blocks(session_id,position,label,kind,instructions) values(sid,b.position,b.label,b.kind,b.instructions) returning id into bid;
 insert into public.session_entries(block_id,exercise_id,position,label,name,reference_url,eligible,prescription,instructions)
 select bid,e.exercise_id,e.position,e.label,x.name,x.reference_url,e.eligible,e.prescription,e.instructions from public.template_entries e join public.exercises x on x.id=e.exercise_id where e.block_id=b.id order by e.position;
 end loop;end loop;return aid;
 exception when unique_violation then raise exception 'This program is already assigned to this athlete on that start date.';
 end
$$;

create or replace function public.get_my_sessions() returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'athleteId',s.athlete_id,'assignmentId',s.assignment_id,'date',s.scheduled_date,'title',s.title,'description',s.description,'category',s.category,'estimatedMinutes',s.estimated_minutes,'status',s.status,'finishedAt',s.finished_at,'version',s.version,'updatedAt',s.updated_at,'blocks',coalesce((
 select jsonb_agg(jsonb_build_object('id',b.id,'label',b.label,'kind',b.kind,'instructions',b.instructions,'entries',coalesce((
 select jsonb_agg(jsonb_build_object('id',e.id,'exerciseId',e.exercise_id,'name',e.name,'label',e.label,'eligible',e.eligible,'referenceUrl',e.reference_url,'prescription',e.prescription,'instructions',e.instructions,'completed',coalesce(r.completed,false),'load',coalesce(r.load,''),'notes',coalesce(r.notes,'')) order by e.position)
 from public.session_entries e left join public.exercise_results r on r.entry_id=e.id where e.block_id=b.id),'[]'::jsonb)) order by b.position)
 from public.session_blocks b where b.session_id=s.id),'[]'::jsonb)) order by s.scheduled_date,s.id),'[]'::jsonb) from public.workout_sessions s
$$;

create or replace function public.get_program(p_id uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('schemaVersion',1,'name',p.name,'description',p.description,'weeks',coalesce((select jsonb_agg(jsonb_build_object('week',w.week_number,'workouts',coalesce((select jsonb_agg(jsonb_build_object('day',t.day,'title',t.title,'description',t.description,'category',t.category,'blocks',coalesce((select jsonb_agg(jsonb_build_object('label',b.label,'kind',b.kind,'instructions',b.instructions,'entries',coalesce((select jsonb_agg(jsonb_build_object('exerciseKey',x.exercise_key,'name',x.name,'label',e.label,'eligible',e.eligible,'aliases',x.aliases,'prescription',e.prescription,'instructions',e.instructions)||case when x.reference_url is null then '{}'::jsonb else jsonb_build_object('referenceUrl',x.reference_url) end order by e.position) from public.template_entries e join public.exercises x on x.id=e.exercise_id where e.block_id=b.id),'[]'::jsonb)) order by b.position) from public.template_blocks b where b.workout_id=t.id),'[]'::jsonb)) || case when t.estimated_minutes is null then '{}'::jsonb else jsonb_build_object('estimatedMinutes',t.estimated_minutes) end order by t.position) from public.workout_templates t where t.week_id=w.id),'[]'::jsonb)) order by w.week_number) from public.program_weeks w where w.program_id=p.id),'[]'::jsonb)) from public.programs p where p.id=p_id
$$;
commit;
