// Optional PostgreSQL/WASM smoke test. PGLITE_MODULE points to an installed
// @electric-sql/pglite/dist/index.js. Not a replacement for real Storage/Auth QA.
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const {PGlite}=await import(pathToFileURL(process.env.PGLITE_MODULE).href);
const db=new PGlite();
await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema storage;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql immutable as 'select string_to_array($1,''/'')';
grant usage on schema auth,storage,public to anon,authenticated;
grant select,insert,update,delete on storage.objects to anon,authenticated;
`);
await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333';
await db.query('insert into auth.users values ($1,$2,now()),($3,$4,now())',[a,'a@example.test',b,'b@example.test']);
await db.query('insert into public.license_versions values ($1,$2,true,now())',['test-v1',JSON.stringify({version:'test-v1',approved:true,contact:'team@example.test',region:'Taiwan',text:'test terms'})]);
await db.exec(`set role authenticated; set request.jwt.claim.sub='${a}';`);
await db.query('insert into storage.objects(bucket_id,name,metadata) values ($1,$2,$3)',['corpus',`${a}/${id}.txt`,JSON.stringify({size:123})]);
const values=[id,`${a}/${id}.txt`,'story.txt','a'.repeat(64),JSON.stringify({name:'測試作者',owner:'本人',title:'測試作品',category:'hakka-text',dialect:'四縣',source:'自行創作'}),'測試作者','test-v1',true,true];
const submit='select (public.submit_corpus($1,$2,$3,$4,$5,$6,$7,$8,$9)).*';
for(const [index,value] of [[5,'不同人'],[6,'old-version'],[7,false],[8,false]]){const copy=[...values];copy[index]=value;await assert.rejects(db.query(submit,copy));}
const {rows}=await db.query(submit,values);assert.equal(rows[0].email,'a@example.test');assert.equal(rows[0].status,'pending');assert.equal(rows[0].license_snapshot.text,'test terms');
await db.query(submit,values);assert.equal((await db.query('select * from public.submissions')).rows.length,1);
await assert.rejects(db.query("update public.submissions set signature='changed'"));
assert.equal((await db.query('delete from storage.objects where name=$1 returning *',[values[1]])).rows.length,0);
await db.exec(`set request.jwt.claim.sub='${b}';`);
assert.equal((await db.query('select * from public.submissions')).rows.length,0);
assert.equal((await db.query('select * from storage.objects')).rows.length,0);
await assert.rejects(db.query(submit,values));
await assert.rejects(db.query('select public.request_withdrawal($1)',[id]));
await db.exec(`reset role; update public.submissions set status='approved';`);
assert.equal((await db.query('select * from public.training_candidates')).rows.length,1);
await db.exec(`set role authenticated; set request.jwt.claim.sub='${a}';`);
await db.query('select public.request_withdrawal($1)',[id]);
await db.exec('reset role');assert.equal((await db.query('select * from public.training_candidates')).rows.length,0);
await db.exec('set role anon');assert.equal((await db.query('select * from storage.objects')).rows.length,0);
await assert.rejects(db.query(submit,values));
await db.close();console.log('Database smoke checks passed: signature, terms, consent, idempotency, RLS isolation, withdrawal.');
