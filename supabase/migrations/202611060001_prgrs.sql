-- PRGRS initial schema. Apply with Supabase migrations, never by resetting production.
begin;
revoke create on schema public from public;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete restrict,
 name text not null default '' check (length(name)<=160),
 timezone text not null default 'UTC', created_at timestamptz not null default now()
);
create table public.user_roles (
 user_id uuid not null references public.profiles(id) on delete cascade,
 role text not null check(role in ('athlete','coach')), primary key(user_id,role)
);
create table public.coach_athletes (
 coach_id uuid not null references public.profiles(id) on delete cascade,
 athlete_id uuid not null references public.profiles(id) on delete cascade,
 accepted boolean not null default false, created_at timestamptz not null default now(),
 primary key(coach_id,athlete_id),check(coach_id<>athlete_id)
);
create index coach_athletes_athlete_idx on public.coach_athletes(athlete_id);
create function public.has_role(p_role text) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select exists(select 1 from public.user_roles where user_id=auth.uid() and role=p_role)
$$;
create function public.can_read_athlete(p_athlete uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$
 select p_athlete=auth.uid() or (public.has_role('coach') and exists(select 1 from public.coach_athletes where coach_id=auth.uid() and athlete_id=p_athlete and accepted))
$$;
create function public.handle_signup() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
 begin insert into public.profiles(id,name,timezone) values(new.id,left(coalesce(new.raw_user_meta_data->>'name',''),160),case when exists(select 1 from pg_timezone_names where name=new.raw_user_meta_data->>'timezone') then new.raw_user_meta_data->>'timezone' else 'UTC' end); insert into public.user_roles(user_id,role) values(new.id,'athlete');return new;end
$$;
create trigger prgrs_signup after insert on auth.users for each row execute function public.handle_signup();
create table public.exercises (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references public.profiles(id) on delete restrict,
 exercise_key text not null check(exercise_key ~ '^[a-z0-9][a-z0-9-]{0,79}$'),
 name text not null check(length(name) between 1 and 160), aliases text[] not null default '{}',
 reference_url text check(reference_url is null or (reference_url ~ '^https?://' and length(reference_url)<=2000)),
 created_at timestamptz not null default now(), unique(owner_id,exercise_key)
);
create table public.programs (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles(id) on delete restrict,
 name text not null check(length(name) between 1 and 160),description text not null default '',
 checksum text not null,version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(owner_id,checksum)
);
create index programs_owner_idx on public.programs(owner_id);
create table public.program_weeks (
 id uuid primary key default gen_random_uuid(),program_id uuid not null references public.programs(id) on delete cascade,
 week_number integer not null check(week_number between 1 and 52),unique(program_id,week_number)
);
create table public.workout_templates (
 id uuid primary key default gen_random_uuid(),week_id uuid not null references public.program_weeks(id) on delete cascade,
 day integer not null check(day between 1 and 7),position integer not null check(position>=0),title text not null check(length(title) between 1 and 160),unique(week_id,position)
);
create index workout_templates_week_idx on public.workout_templates(week_id);
create table public.template_blocks (
 id uuid primary key default gen_random_uuid(),workout_id uuid not null references public.workout_templates(id) on delete cascade,
 position integer not null check(position>=0),label text not null default '',
 kind text not null check(kind in ('single','superset','circuit','emom','amrap','for_time','warmup','cooldown','instruction')),
 instructions text not null default '',unique(workout_id,position)
);
create table public.template_entries (
 id uuid primary key default gen_random_uuid(),block_id uuid not null references public.template_blocks(id) on delete cascade,
 exercise_id uuid not null references public.exercises(id) on delete restrict,position integer not null check(position>=0),
 label text not null default '',eligible boolean not null default true,prescription jsonb not null default '{}' check(jsonb_typeof(prescription)='object'),instructions text not null default '',unique(block_id,position)
);
create index template_entries_exercise_idx on public.template_entries(exercise_id);
create table public.program_assignments (
 id uuid primary key default gen_random_uuid(),program_id uuid not null references public.programs(id) on delete restrict,
 program_version integer not null,coach_id uuid not null references public.profiles(id) on delete restrict,
 athlete_id uuid not null references public.profiles(id) on delete restrict,start_date date not null,
 created_at timestamptz not null default now(),unique(program_id,athlete_id,start_date)
);
create index assignments_athlete_idx on public.program_assignments(athlete_id);
create index assignments_coach_idx on public.program_assignments(coach_id);
create table public.workout_sessions (
 id uuid primary key default gen_random_uuid(),assignment_id uuid not null references public.program_assignments(id) on delete restrict,
 athlete_id uuid not null references public.profiles(id) on delete restrict,
 template_id uuid references public.workout_templates(id) on delete set null,
 scheduled_date date not null,title text not null,
 status text not null default 'scheduled' check(status in ('scheduled','in_progress','finished','skipped')),
 finished_at timestamptz,version integer not null default 0 check(version>=0),updated_at timestamptz not null default now(),
 check ((status='finished')=(finished_at is not null)),unique(assignment_id,template_id)
);
create index sessions_athlete_date_idx on public.workout_sessions(athlete_id,scheduled_date);
create index sessions_template_idx on public.workout_sessions(template_id);
create table public.session_blocks (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.workout_sessions(id) on delete restrict,
 position integer not null,label text not null,kind text not null,instructions text not null,unique(session_id,position)
);
create table public.session_entries (
 id uuid primary key default gen_random_uuid(),block_id uuid not null references public.session_blocks(id) on delete restrict,
 exercise_id uuid not null references public.exercises(id) on delete restrict,
 position integer not null,label text not null,name text not null,reference_url text,eligible boolean not null,
 prescription jsonb not null,instructions text not null,unique(block_id,position)
);
create index session_entries_exercise_idx on public.session_entries(exercise_id);
create table public.exercise_results (
 entry_id uuid primary key references public.session_entries(id) on delete restrict,
 completed boolean not null default false,load text not null default '' check(length(load)<=160),
 notes text not null default '' check(length(notes)<=4000),metrics jsonb not null default '{}' check(jsonb_typeof(metrics)='object'),updated_at timestamptz not null default now()
);
create table public.sync_receipts (
 mutation_id uuid primary key,athlete_id uuid not null references public.profiles(id) on delete restrict,
 session_id uuid not null references public.workout_sessions(id) on delete restrict,
 version integer not null,created_at timestamptz not null default now()
);
create index sync_receipts_owner_idx on public.sync_receipts(athlete_id);
create index sync_receipts_session_idx on public.sync_receipts(session_id);
-- All underlying tables have RLS; graph writes occur only through checked transactions.
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.coach_athletes enable row level security;
alter table public.exercises enable row level security;
alter table public.programs enable row level security;
alter table public.program_weeks enable row level security;
alter table public.workout_templates enable row level security;
alter table public.template_blocks enable row level security;
alter table public.template_entries enable row level security;
alter table public.program_assignments enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.session_blocks enable row level security;
alter table public.session_entries enable row level security;
alter table public.exercise_results enable row level security;
alter table public.sync_receipts enable row level security;
create policy profiles_read on public.profiles for select to authenticated using (id=auth.uid() or public.can_read_athlete(id) or exists(select 1 from public.coach_athletes where athlete_id=auth.uid() and coach_id=profiles.id));
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy roles_read on public.user_roles for select to authenticated using(user_id=auth.uid());
create policy relationships_read on public.coach_athletes for select to authenticated using(coach_id=auth.uid() or athlete_id=auth.uid());
create policy exercises_read on public.exercises for select to authenticated using(owner_id=auth.uid() or exists(select 1 from public.session_entries e join public.session_blocks b on b.id=e.block_id join public.workout_sessions s on s.id=b.session_id where e.exercise_id=exercises.id and public.can_read_athlete(s.athlete_id)));
create policy exercises_insert on public.exercises for insert to authenticated with check(owner_id=auth.uid() and public.has_role('coach'));
create policy exercises_update on public.exercises for update to authenticated using(owner_id=auth.uid() and public.has_role('coach')) with check(owner_id=auth.uid() and public.has_role('coach'));
create policy programs_read on public.programs for select to authenticated using(owner_id=auth.uid());
create policy weeks_read on public.program_weeks for select to authenticated using(exists(select 1 from public.programs where id=program_id and owner_id=auth.uid()));
create policy templates_read on public.workout_templates for select to authenticated using(exists(select 1 from public.program_weeks w join public.programs p on p.id=w.program_id where w.id=week_id and p.owner_id=auth.uid()));
create policy blocks_read on public.template_blocks for select to authenticated using(exists(select 1 from public.workout_templates where id=workout_id));
create policy entries_read on public.template_entries for select to authenticated using(exists(select 1 from public.template_blocks where id=block_id));
create policy assignments_read on public.program_assignments for select to authenticated using(public.can_read_athlete(athlete_id));
create policy sessions_read on public.workout_sessions for select to authenticated using(public.can_read_athlete(athlete_id));
create policy session_blocks_read on public.session_blocks for select to authenticated using(exists(select 1 from public.workout_sessions where id=session_id));
create policy session_entries_read on public.session_entries for select to authenticated using(exists(select 1 from public.session_blocks where id=block_id));
create policy results_read on public.exercise_results for select to authenticated using(exists(select 1 from public.session_entries where id=entry_id));
create policy receipts_read on public.sync_receipts for select to authenticated using(athlete_id=auth.uid());
-- Explicit grants do not inherit Supabase's broad defaults.
revoke all on public.profiles,public.user_roles,public.coach_athletes,public.exercises,public.programs,public.program_weeks,public.workout_templates,public.template_blocks,public.template_entries,public.program_assignments,public.workout_sessions,public.session_blocks,public.session_entries,public.exercise_results,public.sync_receipts from anon,authenticated;
grant select on public.profiles,public.user_roles,public.coach_athletes,public.exercises,public.programs,public.program_weeks,public.workout_templates,public.template_blocks,public.template_entries,public.program_assignments,public.workout_sessions,public.session_blocks,public.session_entries,public.exercise_results,public.sync_receipts to authenticated;
grant update(name,timezone) on public.profiles to authenticated;
grant insert,update on public.exercises to authenticated;
create function public.validate_timezone() returns trigger language plpgsql set search_path=public,pg_temp as $$
 begin if not exists(select 1 from pg_timezone_names where name=new.timezone) then raise exception 'Invalid timezone';end if;return new;end
$$;
create trigger profile_timezone before insert or update on public.profiles for each row execute function public.validate_timezone();

create function public.request_coaching(p_athlete uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 begin if auth.uid() is null or not public.has_role('coach') then raise exception 'Coach capability required';end if;
 if p_athlete=auth.uid() then return;end if;
 insert into public.coach_athletes(coach_id,athlete_id) values(auth.uid(),p_athlete) on conflict do nothing;end
$$;
create function public.respond_coaching(p_coach uuid,p_accept boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$
 begin if auth.uid() is null then raise exception 'Authentication required';end if;
 if p_accept then update public.coach_athletes set accepted=true where coach_id=p_coach and athlete_id=auth.uid();else delete from public.coach_athletes where coach_id=p_coach and athlete_id=auth.uid();end if;end
$$;

-- Server-side validation is independent of client-side Zod validation.
create function public.validate_program(p jsonb) returns void language plpgsql set search_path=public,pg_temp as $$
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
create function public.save_program(p_program jsonb,p_replace uuid default null) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
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
 insert into public.workout_templates(week_id,day,position,title) values(wid,(d->>'day')::integer,dp,d->>'title') returning id into did;dp=dp+1;bp=0;
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
create function public.assign_program(p_program uuid,p_athlete uuid,p_start date) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
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
 insert into public.workout_sessions(assignment_id,athlete_id,template_id,scheduled_date,title) values(aid,p_athlete,d.id,p_start+((d.week_number-1)*7+d.day-1),d.title) returning id into sid;
 for b in select * from public.template_blocks where workout_id=d.id order by position loop
 insert into public.session_blocks(session_id,position,label,kind,instructions) values(sid,b.position,b.label,b.kind,b.instructions) returning id into bid;
 insert into public.session_entries(block_id,exercise_id,position,label,name,reference_url,eligible,prescription,instructions)
 select bid,e.exercise_id,e.position,e.label,x.name,x.reference_url,e.eligible,e.prescription,e.instructions from public.template_entries e join public.exercises x on x.id=e.exercise_id where e.block_id=b.id order by e.position;
 end loop;end loop;return aid;
 exception when unique_violation then raise exception 'This program is already assigned to this athlete on that start date.';
 end
$$;
create function public.apply_session_mutation(p_id uuid,p_session uuid,p_base_version integer,p_log jsonb) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
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
 if s.version is distinct from p_base_version then raise exception 'VERSION_CONFLICT: server version %; local base %',s.version,p_base_version;end if;
 if coalesce(p_log->>'status','') not in ('scheduled','in_progress','finished','skipped') or jsonb_typeof(p_log->'results') is distinct from 'array' then raise exception 'Invalid workout log';end if;
 if (p_log->>'status'='finished') is distinct from (p_log->>'finishedAt' is not null) then raise exception 'Finished timestamp must match status';end if;
 select count(*) into count_entries from public.session_entries e join public.session_blocks b on b.id=e.block_id where b.session_id=s.id;
 count_payload=jsonb_array_length(p_log->'results');
 if count_payload<>count_entries or (select count(distinct x->>'entryId') from jsonb_array_elements(p_log->'results') x)<>count_entries then raise exception 'Log must contain each session entry exactly once';end if;
 for r in select value from jsonb_array_elements(p_log->'results') loop
 if jsonb_typeof(r->'completed') is distinct from 'boolean' or jsonb_typeof(r->'load') is distinct from 'string' or jsonb_typeof(r->'notes') is distinct from 'string' then raise exception 'Invalid result';end if;
 if not exists(select 1 from public.session_entries e join public.session_blocks b on b.id=e.block_id where e.id=(r->>'entryId')::uuid and b.session_id=s.id and (e.eligible or not (r->>'completed')::boolean)) then raise exception 'Invalid entry or instruction-only completion';end if;
 insert into public.exercise_results(entry_id,completed,load,notes) values((r->>'entryId')::uuid,(r->>'completed')::boolean,r->>'load',r->>'notes') on conflict(entry_id) do update set completed=excluded.completed,load=excluded.load,notes=excluded.notes,updated_at=now();
 end loop;
 update public.workout_sessions set status=p_log->>'status',finished_at=(p_log->>'finishedAt')::timestamptz,version=version+1,updated_at=now() where id=s.id;
 insert into public.sync_receipts(mutation_id,athlete_id,session_id,version) values(p_id,auth.uid(),s.id,s.version+1);
 return s.version+1;end
$$;
-- Security invoker: all reads below are additionally filtered by RLS.
create function public.get_my_sessions() returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'athleteId',s.athlete_id,'assignmentId',s.assignment_id,'date',s.scheduled_date,'title',s.title,'status',s.status,'finishedAt',s.finished_at,'version',s.version,'updatedAt',s.updated_at,'blocks',coalesce((
 select jsonb_agg(jsonb_build_object('id',b.id,'label',b.label,'kind',b.kind,'instructions',b.instructions,'entries',coalesce((
 select jsonb_agg(jsonb_build_object('id',e.id,'exerciseId',e.exercise_id,'name',e.name,'label',e.label,'eligible',e.eligible,'referenceUrl',e.reference_url,'prescription',e.prescription,'instructions',e.instructions,'completed',coalesce(r.completed,false),'load',coalesce(r.load,''),'notes',coalesce(r.notes,'')) order by e.position)
 from public.session_entries e left join public.exercise_results r on r.entry_id=e.id where e.block_id=b.id),'[]'::jsonb)) order by b.position)
 from public.session_blocks b where b.session_id=s.id),'[]'::jsonb)) order by s.scheduled_date,s.id),'[]'::jsonb) from public.workout_sessions s
$$;
create function public.get_program(p_id uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('schemaVersion',1,'name',p.name,'description',p.description,'weeks',coalesce((select jsonb_agg(jsonb_build_object('week',w.week_number,'workouts',coalesce((select jsonb_agg(jsonb_build_object('day',t.day,'title',t.title,'blocks',coalesce((select jsonb_agg(jsonb_build_object('label',b.label,'kind',b.kind,'instructions',b.instructions,'entries',coalesce((select jsonb_agg(jsonb_build_object('exerciseKey',x.exercise_key,'name',x.name,'label',e.label,'eligible',e.eligible,'aliases',x.aliases,'prescription',e.prescription,'instructions',e.instructions)||case when x.reference_url is null then '{}'::jsonb else jsonb_build_object('referenceUrl',x.reference_url) end order by e.position) from public.template_entries e join public.exercises x on x.id=e.exercise_id where e.block_id=b.id),'[]'::jsonb)) order by b.position) from public.template_blocks b where b.workout_id=t.id),'[]'::jsonb)) order by t.position) from public.workout_templates t where t.week_id=w.id),'[]'::jsonb)) order by w.week_number) from public.program_weeks w where w.program_id=p.id),'[]'::jsonb)) from public.programs p where p.id=p_id
$$;
-- Supabase gives functions PUBLIC execution by default. Close that boundary explicitly.
revoke execute on function public.has_role(text),public.can_read_athlete(uuid),public.handle_signup(),public.validate_timezone(),public.request_coaching(uuid),public.respond_coaching(uuid,boolean),public.validate_program(jsonb),public.save_program(jsonb,uuid),public.assign_program(uuid,uuid,date),public.apply_session_mutation(uuid,uuid,integer,jsonb),public.get_my_sessions(),public.get_program(uuid) from public,anon,authenticated;
grant execute on function public.has_role(text),public.can_read_athlete(uuid),public.request_coaching(uuid),public.respond_coaching(uuid,boolean),public.save_program(jsonb,uuid),public.assign_program(uuid,uuid,date),public.apply_session_mutation(uuid,uuid,integer,jsonb),public.get_my_sessions(),public.get_program(uuid) to authenticated;
commit;
