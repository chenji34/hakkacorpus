import {cp,mkdir,writeFile,readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname,sep} from 'node:path';
const mode=process.argv[2];
if(mode==='build'){
  await mkdir('dist',{recursive:true});
  await cp('public','dist',{recursive:true});
  await cp('src','dist/src',{recursive:true});
  const enabled=process.env.COLLECTION_ENABLED==='true';
  if(enabled && (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY)) throw Error('缺少 Supabase 設定');
  if(process.env.SUPABASE_ANON_KEY?.startsWith('sb_secret_')) throw Error('不得使用 secret key');
  const token=process.env.SUPABASE_ANON_KEY?.split('.')[1];
  if(token){try{if(JSON.parse(Buffer.from(token,'base64url')).role==='service_role')throw Error('禁止公開 service_role');}catch(e){if(e.message.includes('service_role'))throw e;}}
  await writeFile('dist/config.json',JSON.stringify({supabaseUrl:process.env.SUPABASE_URL||'',supabaseKey:process.env.SUPABASE_ANON_KEY||'',enabled}));
  console.log('Built dist/');
} else {
  const root=resolve('dist');
  const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml'};
  createServer(async(req,res)=>{try{
    const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return;}
    const file=path===root?resolve(root,'index.html'):path;
    const contents=await readFile(file);
    res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream'}).end(contents);
  }catch{res.writeHead(404).end('Not found');}}).listen(3000,'127.0.0.1',()=>console.log('http://127.0.0.1:3000'));
}
