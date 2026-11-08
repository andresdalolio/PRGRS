begin;
-- Empty full-log slots are absence of activity, not recorded results.
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
 if s.version is distinct from p_base_version then raise exception 'VERSION_CONFLICT: server version %; local base %',s.version,p_base_version;end if;
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

-- Existing meaningful results are preserved. Only blank, unchecked, metric-free rows are removed.
delete from public.exercise_results where not completed and btrim(load)='' and btrim(notes)='' and metrics='{}'::jsonb;

create table public.feedback_items (
 id uuid primary key,
 owner_id uuid not null references public.profiles(id),
 title text not null check(length(btrim(title)) between 1 and 160),
 description text not null default '' check(length(description)<=4000),
 implemented boolean not null default false,
 created_at timestamptz not null,
 version integer not null default 0 check(version>=0),
 deleted boolean not null default false
);
create index feedback_owner on public.feedback_items(owner_id);
create table public.feedback_receipts (
 mutation_id uuid primary key,
 owner_id uuid not null references public.profiles(id),
 item_id uuid not null references public.feedback_items(id),
 version integer not null
);
create index feedback_receipt_owner on public.feedback_receipts(owner_id);
create index feedback_receipt_item on public.feedback_receipts(item_id);
alter table public.feedback_items enable row level security;
alter table public.feedback_receipts enable row level security;
create policy feedback_read on public.feedback_items for select to authenticated using(owner_id=(select auth.uid()));
create policy feedback_receipt_read on public.feedback_receipts for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.feedback_items,public.feedback_receipts from public,anon,authenticated;
grant select on public.feedback_items,public.feedback_receipts to authenticated;

-- Versioned full-item writes follow the workout protocol. Tombstones and receipts prevent resurrection.
create function public.apply_feedback_mutation(p_id uuid,p_item uuid,p_base_version integer,p_value jsonb)
returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare item public.feedback_items; ack public.feedback_receipts;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 -- Lock even a not-yet-created item, including concurrent creation/retry across tabs.
 perform pg_advisory_xact_lock(hashtextextended(p_item::text,0));
 select * into item from public.feedback_items where id=p_item for update;
 if item.id is not null and item.owner_id<>auth.uid() then raise exception 'Feedback unavailable'; end if;
 select * into ack from public.feedback_receipts where mutation_id=p_id;
 if ack.mutation_id is not null then
   if ack.owner_id<>auth.uid() or ack.item_id<>p_item then raise exception 'Mutation ID belongs to another operation'; end if;
   return ack.version;
 end if;
 if coalesce(item.version,0) is distinct from p_base_version then raise exception 'VERSION_CONFLICT: feedback changed on another device'; end if;
 if item.deleted then raise exception 'VERSION_CONFLICT: feedback was deleted on another device'; end if;
 if jsonb_typeof(p_value->'title') is distinct from 'string' or
    jsonb_typeof(p_value->'description') is distinct from 'string' or
    jsonb_typeof(p_value->'implemented') is distinct from 'boolean' or
    jsonb_typeof(p_value->'deleted') is distinct from 'boolean' or
    jsonb_typeof(p_value->'createdAt') is distinct from 'string' then raise exception 'Invalid feedback'; end if;
 insert into public.feedback_items(id,owner_id,title,description,implemented,created_at,version,deleted)
 values(p_item,auth.uid(),p_value->>'title',p_value->>'description',(p_value->>'implemented')::boolean,
 (p_value->>'createdAt')::timestamptz,1,(p_value->>'deleted')::boolean)
 on conflict(id) do update set title=excluded.title,description=excluded.description,
 implemented=excluded.implemented,deleted=excluded.deleted,version=feedback_items.version+1;
 insert into public.feedback_receipts values(p_id,auth.uid(),p_item,p_base_version+1);
 return p_base_version+1;
end $$;
revoke execute on function public.apply_feedback_mutation(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.apply_feedback_mutation(uuid,uuid,integer,jsonb) to authenticated;
commit;
