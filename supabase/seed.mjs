import {readFile,writeFile} from 'node:fs/promises';
const terms=JSON.parse(await readFile(new URL('../public/terms.json',import.meta.url),'utf8'));
const quote=s=>`'${s.replaceAll("'","''")}'`;
await writeFile(new URL('./license-seed.sql',import.meta.url),`-- Review before running. Existing signed snapshots never change.\ninsert into public.license_versions(version,document,active) values (${quote(terms.version)},${quote(JSON.stringify(terms))}::jsonb,false);\n`);
console.log('Generated supabase/license-seed.sql (inactive)');
