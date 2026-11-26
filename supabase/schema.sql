-- Run once in a new Supabase project's SQL editor. No public corpus access.
create table public.license_versions (
 version text primary key,
 document jsonb not null,
 active boolean not null default false,
 created_at timestamptz not null default now(),
 check (document->>'version'=version),
 check (not active or coalesce((document->>'approved'='true' and length(document->>'contact')>5 and length(document->>'region')>1),false))
);
create unique index one_active_license on public.license_versions ((active)) where active;
create function public.lock_license_document() returns trigger language plpgsql set search_path='' as $$
begin
 if new.document is distinct from old.document or new.version is distinct from old.version then
 raise exception '條款不可原地改寫，請新增版本'; end if;
 return new;
end; $$;
create trigger immutable_license before update on public.license_versions for each row execute function public.lock_license_document();
alter table public.license_versions enable row level security;
create policy read_active_license on public.license_versions for select to anon,authenticated using (active);
grant select on public.license_versions to anon,authenticated;
create table public.submissions (
 id uuid primary key,
 user_id uuid not null references auth.users(id),
 email text not null,
 metadata jsonb not null,
 object_path text unique not null,
 original_name text not null,
 file_size bigint not null,
 client_sha256 text not null check (client_sha256 ~ '^[a-f0-9]{64}$'),
 signature text not null,
 license_version text not null references public.license_versions(version),
 license_snapshot jsonb not null,
 rights_confirmed boolean not null check(rights_confirmed),
 consent_confirmed boolean not null check(consent_confirmed),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '5 years'),
 status text not null default 'pending' check(status in ('pending','approved','rejected','withdrawal_requested','withdrawn')),
 withdrawal_requested_at timestamptz
);
alter table public.submissions enable row level security;
create policy own_records on public.submissions for select to authenticated using(user_id=auth.uid());
grant select on public.submissions to authenticated;
revoke insert,update,delete on public.submissions from anon,authenticated;
create table public.audit_events (
 id bigint generated always as identity primary key,
 submission_id uuid not null references public.submissions(id),
 actor uuid,
 event text not null,
 created_at timestamptz not null default now()
);
alter table public.audit_events enable row level security;
-- No browser access to audit table. No service credentials in browser.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('corpus','corpus',false,52428800,array['application/octet-stream']);
create policy own_uploads on storage.objects for insert to authenticated with check (
 bucket_id='corpus' and (storage.foldername(name))[1]=auth.uid()::text
 and name ~ '^[a-f0-9-]+/[a-f0-9-]+\.(txt|md|csv|docx|pdf|mp3|wav|m4a|ogg|flac)$'
 and exists(select 1 from public.license_versions where active)
);
create policy own_downloads on storage.objects for select to authenticated using (
 bucket_id='corpus' and (storage.foldername(name))[1]=auth.uid()::text
);
-- Submitted files cannot be overwritten or removed by contributors.
create policy remove_unsigned on storage.objects for delete to authenticated using (
 bucket_id='corpus' and (storage.foldername(name))[1]=auth.uid()::text
 and not exists(select 1 from public.submissions s where s.object_path=name)
);
create or replace function public.submit_corpus(
 submission_id uuid, object_path text, original_name text, file_hash text,
 metadata jsonb, signature text, terms_version text,
 rights_confirmed boolean, consent_confirmed boolean
) returns public.submissions language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=auth.uid(); v_email text; v_doc jsonb; v_size bigint;
 v_row public.submissions; v_ext text;
begin
 if v_user is null then raise exception '請先驗證 Email'; end if;
 select email into v_email from auth.users where id=v_user and email_confirmed_at is not null;
 if v_email is null then raise exception 'Email 尚未驗證'; end if;
 -- Serialize repeated attempts for a single submission and make retry idempotent.
 perform pg_advisory_xact_lock(hashtextextended(submission_id::text,0));
 select * into v_row from public.submissions s where s.id=submission_id;
 if found then
   if v_row.user_id<>v_user then raise exception '無權存取'; end if;
   return v_row;
 end if;
 select document into v_doc from public.license_versions where version=terms_version and active for share;
 if v_doc is null or v_doc->>'approved' is distinct from 'true' then raise exception '條款未開放或已更新，請重新整理'; end if;
 if rights_confirmed is distinct from true or consent_confirmed is distinct from true then raise exception '尚未同意授權'; end if;
 if jsonb_typeof(metadata)<>'object' or metadata is null or octet_length(metadata::text)>16000 then raise exception '作品資料格式錯誤'; end if;
 if coalesce(length(trim(metadata->>'name')),0) not between 1 and 100
 or coalesce(length(trim(metadata->>'owner')),0) not between 1 and 200
 or coalesce(length(trim(metadata->>'title')),0) not between 1 and 300
 or coalesce(length(trim(metadata->>'source')),0) not between 1 and 2000
 or coalesce(length(trim(metadata->>'dialect')),0) not between 1 and 100
 or coalesce(metadata->>'category','') not in ('hakka-text','mandarin-hakka','hakka-audio')
 then raise exception '作品資料不完整'; end if;
 if signature is null or signature<>trim(metadata->>'name') then raise exception '簽署姓名不符'; end if;
 if original_name is null or length(original_name) not between 1 and 500 or file_hash is null or file_hash !~ '^[a-f0-9]{64}$' then raise exception '檔案資訊錯誤'; end if;
 v_ext:=split_part(object_path,'.',2);
 if object_path is null or object_path<>v_user::text||'/'||submission_id::text||'.'||v_ext
 or v_ext not in ('txt','md','csv','docx','pdf','mp3','wav','m4a','ogg','flac') then raise exception '檔案路徑不合法'; end if;
 if (v_ext in ('mp3','wav','m4a','ogg','flac'))<>(metadata->>'category'='hakka-audio') then raise exception '檔案與類別不符'; end if;
 select (o.metadata->>'size')::bigint into v_size from storage.objects o where o.bucket_id='corpus' and o.name=object_path for update;
 if v_size is null or v_size not between 1 and 52428800 then raise exception '檔案尚未上傳或大小不符'; end if;
 insert into public.submissions(id,user_id,email,metadata,object_path,original_name,file_size,client_sha256,signature,license_version,license_snapshot,rights_confirmed,consent_confirmed)
 values(submission_id,v_user,v_email,metadata,object_path,original_name,v_size,file_hash,signature,terms_version,v_doc,true,true) returning * into v_row;
 insert into public.audit_events(submission_id,actor,event) values(submission_id,v_user,'signed_and_submitted');
 return v_row;
end; $$;
revoke all on function public.submit_corpus(uuid,text,text,text,jsonb,text,text,boolean,boolean) from public,anon;
grant execute on function public.submit_corpus(uuid,text,text,text,jsonb,text,text,boolean,boolean) to authenticated;
create or replace function public.request_withdrawal(submission_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.submissions set status='withdrawal_requested',withdrawal_requested_at=now()
 where id=submission_id and user_id=auth.uid() and status in ('pending','approved','rejected');
 if not found then raise exception '找不到可撤回的投稿，或已提出申請'; end if;
 insert into public.audit_events(submission_id,actor,event) values(submission_id,auth.uid(),'withdrawal_requested');
end; $$;
revoke all on function public.request_withdrawal(uuid) from public,anon;
grant execute on function public.request_withdrawal(uuid) to authenticated;
-- Only this view is a candidate list; training ingestion must check it again at execution time.
create view public.training_candidates with (security_invoker=true) as
select * from public.submissions where status='approved' and expires_at>now() and withdrawal_requested_at is null;
revoke all on public.training_candidates from anon,authenticated;
-- No automatic training or public file endpoints are provided.
