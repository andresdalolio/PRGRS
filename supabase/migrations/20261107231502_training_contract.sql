-- Versioned delivery contract; preserve the existing snapshot/result/offline architecture.
begin;
alter table public.programs add column contract_version integer not null default 1 check(contract_version in (1,2));
alter table public.workout_sessions
 add column position integer not null default 0 check(position>=0),
 add column provenance jsonb check(provenance is null or jsonb_typeof(provenance)='object');
-- Old snapshots stay unknown: current templates are not historical evidence.

-- A deliberately limited validator for the generated contract's structural vocabulary.
-- No caller-provided schema reaches save_program. Unknown keywords fail closed.
create function public.check_training_shape(v jsonb, spec jsonb, path text) returns void
language plpgsql immutable set search_path=public,pg_temp as $$
declare k text; child jsonb; item jsonb; idx integer=0; typ text=spec->>'type'; n numeric;
begin
 for k in select jsonb_object_keys(spec) loop
  if k not in ('$schema','type','properties','required','additionalProperties','items','minItems','maxItems','minLength','maxLength','minimum','maximum','pattern','format','const','enum','default','title') then
   raise exception 'Unsupported contract validation keyword: %',k;
  end if;
 end loop;
 if v is null then raise exception '%: Missing value',path; end if;
 if typ='integer' then
  if jsonb_typeof(v)<>'number' then raise exception '%: Expected integer',path;end if;
  n=(v#>>'{}')::numeric;
  if n<>trunc(n) then raise exception '%: Expected integer',path;end if;
 elsif jsonb_typeof(v) is distinct from typ then raise exception '%: Expected %',path,typ;
 end if;
 if spec ? 'const' and v<>spec->'const' then raise exception '%: Unsupported value/version',path;end if;
 if spec ? 'enum' and not (spec->'enum' @> jsonb_build_array(v)) then raise exception '%: Unsupported value',path;end if;
 if typ='object' then
  for k in select jsonb_array_elements_text(coalesce(spec->'required','[]')) loop
   if not v ? k then raise exception '%: Required field %',path,k;end if;
  end loop;
  for k,child in select key,value from jsonb_each(v) loop
   if not (spec->'properties' ? k) then raise exception '%.%: Unknown field',path,k;end if;
   perform public.check_training_shape(child,spec->'properties'->k,path||'.'||k);
  end loop;
 elsif typ='array' then
  if jsonb_array_length(v)<coalesce((spec->>'minItems')::integer,0) or jsonb_array_length(v)>coalesce((spec->>'maxItems')::integer,2147483647) then raise exception '%: Invalid item count',path;end if;
  for item in select value from jsonb_array_elements(v) loop
   perform public.check_training_shape(item,spec->'items',path||'.'||idx);idx=idx+1;
  end loop;
 elsif typ='string' then
  if length(v#>>'{}')<coalesce((spec->>'minLength')::integer,0) or length(v#>>'{}')>coalesce((spec->>'maxLength')::integer,2147483647) then raise exception '%: Invalid text length',path;end if;
  if spec ? 'minLength' and length(trim(v#>>'{}'))=0 then raise exception '%: Text must not be blank',path;end if;
  if spec ? 'pattern' and (v#>>'{}') !~ (spec->>'pattern') then raise exception '%: Invalid format',path;end if;
  if spec->>'format'='uri' and (v#>>'{}') !~ '^https?://[^[:space:]/?#]+([/?#][^[:space:]]*)?$' then raise exception '%: Use an http or https URL',path;end if;
 elsif typ in ('number','integer') then
  n=(v#>>'{}')::numeric;
  if n<coalesce((spec->>'minimum')::numeric,n) or n>coalesce((spec->>'maximum')::numeric,n) then raise exception '%: Number outside supported range',path;end if;
 end if;
end $$;
revoke all on function public.check_training_shape(jsonb,jsonb,text) from public,anon,authenticated;
create or replace function public.validate_program(p jsonb) returns void
language plpgsql set search_path=public,pg_temp as $$
declare spec jsonb; w jsonb; d jsonb; b jsonb; e jsonb; seen integer[]='{}'; identities jsonb='{}'; identity jsonb; key text;
begin
 if p->>'schemaVersion'='1' then spec=$v1${"type":"object","properties":{"schemaVersion":{"type":"number","const":1},"name":{"type":"string","minLength":1,"maxLength":160},"description":{"default":"","type":"string","maxLength":2000},"weeks":{"minItems":1,"maxItems":52,"type":"array","items":{"type":"object","properties":{"week":{"type":"integer","minimum":1,"maximum":52},"workouts":{"maxItems":21,"type":"array","items":{"type":"object","properties":{"day":{"type":"integer","minimum":1,"maximum":7},"title":{"type":"string","minLength":1,"maxLength":160},"description":{"type":"string","maxLength":2000},"category":{"type":"string","maxLength":80},"estimatedMinutes":{"type":"integer","minimum":1,"maximum":1440},"blocks":{"minItems":1,"maxItems":30,"type":"array","items":{"type":"object","properties":{"label":{"type":"string","maxLength":12},"kind":{"type":"string","enum":["single","superset","circuit","emom","amrap","for_time","warmup","cooldown","instruction"]},"instructions":{"default":"","type":"string","maxLength":2000},"entries":{"maxItems":50,"type":"array","items":{"type":"object","properties":{"exerciseKey":{"type":"string","pattern":"^[a-z0-9][a-z0-9-]{0,79}$"},"name":{"type":"string","minLength":1,"maxLength":160},"label":{"type":"string","maxLength":12},"eligible":{"default":true,"type":"boolean"},"referenceUrl":{"type":"string","maxLength":2000,"format":"uri"},"aliases":{"default":[],"maxItems":20,"type":"array","items":{"type":"string","minLength":1,"maxLength":100}},"prescription":{"default":{},"type":"object","properties":{"sets":{"type":"integer","minimum":1,"maximum":100},"reps":{"type":"string","maxLength":2000},"load":{"type":"string","maxLength":2000},"duration":{"type":"string","maxLength":2000},"distance":{"type":"string","maxLength":2000},"calories":{"type":"integer","minimum":1,"maximum":10000},"rounds":{"type":"integer","minimum":1,"maximum":1000},"tempo":{"type":"string","maxLength":2000},"rest":{"type":"string","maxLength":2000},"text":{"type":"string","maxLength":2000}},"additionalProperties":false},"instructions":{"default":"","type":"string","maxLength":2000}},"required":["exerciseKey","name","label"],"additionalProperties":false}}},"required":["label","kind","entries"],"additionalProperties":false}}},"required":["day","title","blocks"],"additionalProperties":false}}},"required":["week","workouts"],"additionalProperties":false}}},"required":["schemaVersion","name","weeks"],"additionalProperties":false}$v1$::jsonb;
 elsif p->>'schemaVersion'='2' then spec=$v2${"type":"object","properties":{"schemaVersion":{"type":"number","const":2},"name":{"type":"string","minLength":1,"maxLength":160},"description":{"default":"","type":"string","maxLength":2000},"weeks":{"minItems":1,"maxItems":52,"type":"array","items":{"type":"object","properties":{"week":{"type":"integer","minimum":1,"maximum":52},"workouts":{"maxItems":21,"type":"array","items":{"type":"object","properties":{"day":{"type":"integer","minimum":1,"maximum":7},"title":{"type":"string","minLength":1,"maxLength":160},"description":{"type":"string","maxLength":2000},"category":{"type":"string","maxLength":80},"estimatedMinutes":{"type":"integer","minimum":1,"maximum":1440},"blocks":{"minItems":1,"maxItems":30,"type":"array","items":{"type":"object","properties":{"label":{"type":"string","maxLength":12},"kind":{"type":"string","enum":["single","superset","circuit","emom","amrap","for_time","warmup","cooldown","instruction"]},"instructions":{"default":"","type":"string","maxLength":2000},"entries":{"maxItems":50,"type":"array","items":{"type":"object","properties":{"exerciseKey":{"type":"string","pattern":"^[a-z0-9][a-z0-9-]{0,79}$"},"name":{"type":"string","minLength":1,"maxLength":160},"label":{"type":"string","maxLength":12},"eligible":{"default":true,"type":"boolean"},"referenceUrl":{"type":"string","maxLength":2000,"format":"uri"},"aliases":{"default":[],"maxItems":20,"type":"array","items":{"type":"string","minLength":1,"maxLength":100}},"prescription":{"default":{},"type":"object","properties":{"sets":{"type":"integer","minimum":1,"maximum":100},"reps":{"type":"string","maxLength":2000},"load":{"type":"string","maxLength":2000},"duration":{"type":"string","maxLength":2000},"distance":{"type":"string","maxLength":2000},"calories":{"type":"integer","minimum":1,"maximum":10000},"rounds":{"type":"integer","minimum":1,"maximum":1000},"tempo":{"type":"string","maxLength":2000},"rest":{"type":"string","maxLength":2000},"text":{"type":"string","maxLength":2000},"targetRpe":{"type":"number","minimum":0,"maximum":10},"targetRir":{"type":"number","minimum":0,"maximum":100},"percentage":{"type":"object","properties":{"value":{"type":"number","minimum":0,"maximum":100},"reference":{"type":"string","minLength":1,"maxLength":2000}},"required":["value","reference"],"additionalProperties":false},"side":{"type":"string","enum":["per_side","alternating","total"]},"pace":{"type":"string","maxLength":2000},"zone":{"type":"string","maxLength":2000},"progression":{"type":"string","maxLength":2000},"stop":{"type":"string","maxLength":2000},"alternatives":{"type":"string","maxLength":2000},"setDetails":{"minItems":1,"maxItems":100,"type":"array","items":{"type":"object","properties":{"kind":{"type":"string","enum":["warmup","work"]},"reps":{"type":"string","maxLength":2000},"load":{"type":"string","maxLength":2000},"duration":{"type":"string","maxLength":2000},"distance":{"type":"string","maxLength":2000},"calories":{"type":"integer","minimum":1,"maximum":10000},"tempo":{"type":"string","maxLength":2000},"rest":{"type":"string","maxLength":2000},"text":{"type":"string","maxLength":2000},"targetRpe":{"type":"number","minimum":0,"maximum":10},"targetRir":{"type":"number","minimum":0,"maximum":100},"percentage":{"type":"object","properties":{"value":{"type":"number","minimum":0,"maximum":100},"reference":{"type":"string","minLength":1,"maxLength":2000}},"required":["value","reference"],"additionalProperties":false},"side":{"type":"string","enum":["per_side","alternating","total"]},"pace":{"type":"string","maxLength":2000},"zone":{"type":"string","maxLength":2000}},"required":["kind"],"additionalProperties":false}}},"additionalProperties":false},"instructions":{"default":"","type":"string","maxLength":2000}},"required":["exerciseKey","name","label"],"additionalProperties":false}}},"required":["label","kind","entries"],"additionalProperties":false}}},"required":["day","title","blocks"],"additionalProperties":false}}},"required":["week","workouts"],"additionalProperties":false}}},"required":["schemaVersion","name","weeks"],"additionalProperties":false}$v2$::jsonb;
 else raise exception 'program.schemaVersion: Supported versions are 1 and 2';end if;
 perform public.check_training_shape(p,spec,'program');
 for w in select value from jsonb_array_elements(p->'weeks') loop
  if (w->>'week')::integer=any(seen) then raise exception 'program.weeks: Week numbers must be unique';end if;
  seen=array_append(seen,(w->>'week')::integer);
  for d in select value from jsonb_array_elements(w->'workouts') loop
   for b in select value from jsonb_array_elements(d->'blocks') loop
    if p->>'schemaVersion'='2' and b->>'kind' in ('superset','circuit','emom','amrap','for_time') and coalesce(length(trim(b->>'instructions')),0)=0 then raise exception 'program.blocks.instructions: Describe the group rounds, timing and recovery protocol';end if;
    for e in select value from jsonb_array_elements(b->'entries') loop
     if b->>'kind'='instruction' and coalesce((e->>'eligible')::boolean,true) then raise exception 'program.entries.eligible: Instruction entries cannot count toward completion';end if;
     if e->'prescription' ? 'sets' and e->'prescription' ? 'setDetails' then raise exception 'program.entries.prescription: Use sets or setDetails, never both';end if;
     key=e->>'exerciseKey';identity=jsonb_build_array(e->>'name',e->>'referenceUrl',coalesce(e->'aliases','[]'));
     if identities ? key and identities->key<>identity then raise exception 'program.entries.exerciseKey: Conflicting names, aliases or references for %',key;end if;
     identities=jsonb_set(identities,array[key],identity);
    end loop;
   end loop;
  end loop;
 end loop;
end $$;
create or replace function public.save_program(p_program jsonb,p_replace uuid default null) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
 declare pid uuid;wid uuid;did uuid;bid uuid;eid uuid;w jsonb;d jsonb;b jsonb;e jsonb;dp integer;bp integer;ep integer;canonical public.exercises;
 begin
 if auth.uid() is null or not public.has_role('coach') then raise exception 'Coach capability required';end if;
 perform public.validate_program(p_program);
 if p_replace is null then insert into public.programs(owner_id,name,description,checksum,contract_version) values(auth.uid(),p_program->>'name',coalesce(p_program->>'description',''),md5(p_program::text),(p_program->>'schemaVersion')::integer) returning id into pid;
 else
 select id into pid from public.programs where id=p_replace and owner_id=auth.uid() for update;
 if pid is null then raise exception 'Program unavailable';end if;
 update public.programs set contract_version=(p_program->>'schemaVersion')::integer,name=p_program->>'name',description=coalesce(p_program->>'description',''),checksum=md5(p_program::text),version=version+1,updated_at=now() where id=pid;
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
 select * into canonical from public.exercises where owner_id=auth.uid() and exercise_key=e->>'exerciseKey' for update;
 if canonical.name is distinct from e->>'name' or canonical.reference_url is distinct from e->>'referenceUrl' or to_jsonb(canonical.aliases)<>coalesce(e->'aliases','[]') then
 raise exception 'Exercise library changed or conflicts for %. Validate and preview again using canonical metadata.',e->>'exerciseKey';end if;
 eid=canonical.id;
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
 insert into public.workout_sessions(assignment_id,athlete_id,template_id,scheduled_date,title,description,category,estimated_minutes,position,provenance) values(aid,p_athlete,d.id,p_start+((d.week_number-1)*7+d.day-1),d.title,d.description,d.category,d.estimated_minutes,d.position,jsonb_build_object('programId',p.id,'name',p.name,'description',p.description,'version',p.version,'schemaVersion',p.contract_version)) returning id into sid;
 for b in select * from public.template_blocks where workout_id=d.id order by position loop
 insert into public.session_blocks(session_id,position,label,kind,instructions) values(sid,b.position,b.label,b.kind,b.instructions) returning id into bid;
 insert into public.session_entries(block_id,exercise_id,position,label,name,reference_url,eligible,prescription,instructions)
 select bid,e.exercise_id,e.position,e.label,x.name,x.reference_url,e.eligible,e.prescription,e.instructions from public.template_entries e join public.exercises x on x.id=e.exercise_id where e.block_id=b.id order by e.position;
 end loop;end loop;return aid;
 exception when unique_violation then raise exception 'This program is already assigned to this athlete on that start date.';
 end
$$;

create or replace function public.get_my_sessions() returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'athleteId',s.athlete_id,'assignmentId',s.assignment_id,'date',s.scheduled_date,'title',s.title,'description',s.description,'category',s.category,'estimatedMinutes',s.estimated_minutes,'status',s.status,'finishedAt',s.finished_at,'version',s.version,'updatedAt',s.updated_at,'position',s.position,'provenance',s.provenance,'blocks',coalesce((
 select jsonb_agg(jsonb_build_object('id',b.id,'label',b.label,'kind',b.kind,'instructions',b.instructions,'entries',coalesce((
 select jsonb_agg(jsonb_build_object('id',e.id,'exerciseId',e.exercise_id,'name',e.name,'label',e.label,'eligible',e.eligible,'referenceUrl',e.reference_url,'prescription',e.prescription,'instructions',e.instructions,'completed',coalesce(r.completed,false),'load',coalesce(r.load,''),'notes',coalesce(r.notes,'')) order by e.position)
 from public.session_entries e left join public.exercise_results r on r.entry_id=e.id where e.block_id=b.id),'[]'::jsonb)) order by b.position)
 from public.session_blocks b where b.session_id=s.id),'[]'::jsonb)) order by s.scheduled_date,s.assignment_id,s.position,s.id),'[]'::jsonb) from public.workout_sessions s
 where s.withdrawn_at is null or s.version>0 or s.status<>'scheduled'
$$;
create or replace function public.get_program(p_id uuid) returns jsonb language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('schemaVersion',p.contract_version,'name',p.name,'description',p.description,'weeks',coalesce((select jsonb_agg(jsonb_build_object('week',w.week_number,'workouts',coalesce((select jsonb_agg(jsonb_build_object('day',t.day,'title',t.title,'description',t.description,'category',t.category,'blocks',coalesce((select jsonb_agg(jsonb_build_object('label',b.label,'kind',b.kind,'instructions',b.instructions,'entries',coalesce((select jsonb_agg(jsonb_build_object('exerciseKey',x.exercise_key,'name',x.name,'label',e.label,'eligible',e.eligible,'aliases',x.aliases,'prescription',e.prescription,'instructions',e.instructions)||case when x.reference_url is null then '{}'::jsonb else jsonb_build_object('referenceUrl',x.reference_url) end order by e.position) from public.template_entries e join public.exercises x on x.id=e.exercise_id where e.block_id=b.id),'[]'::jsonb)) order by b.position) from public.template_blocks b where b.workout_id=t.id),'[]'::jsonb)) || case when t.estimated_minutes is null then '{}'::jsonb else jsonb_build_object('estimatedMinutes',t.estimated_minutes) end order by t.position) from public.workout_templates t where t.week_id=w.id),'[]'::jsonb)) order by w.week_number) from public.program_weeks w where w.program_id=p.id),'[]'::jsonb)) from public.programs p where p.id=p_id
$$;
commit;
