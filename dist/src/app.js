import {validateFile,sha256,downloadReceipt} from './domain.js';
const $=id=>document.getElementById(id);
let config,terms,session=null,currentReceipt=null,working=false,ready=false;
const status=(message,error=false)=>{$('status').textContent=message;$('status').classList.toggle('error',error);};
async function api(path,{method='GET',body,raw=false}={}){
  const response=await fetch(`${config.supabaseUrl}${path}`,{method,headers:{apikey:config.supabaseKey,Authorization:`Bearer ${session?.access_token||config.supabaseKey}`,...(raw?{'Content-Type':'application/octet-stream'}:{'Content-Type':'application/json'})},body:body===undefined?undefined:raw?body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok){if(response.status===401)throw Error('驗證已過期，請重新驗證 Email。');throw Error(data.msg||data.message||data.error_description||data.error||'服務暫時無法使用，請稍後重試。');}return data;
}
async function task(fn){if(working)return;working=true;const buttons=[...document.querySelectorAll('button')];buttons.forEach(b=>b.disabled=true);try{await fn();}catch(e){status(e.message,true);}finally{working=false;buttons.forEach(b=>b.disabled=false);if(!ready)$('email-form').querySelector('button').disabled=true;}}
function renderTerms(){ $('terms').textContent=`${terms.text}\n\n被授權人：${terms.recipient}\n聯絡窗口：${terms.contact}\n資料處理地區：${terms.region}`; }
function printText(text){$('print-area').textContent=text;window.print();}
function showReceipt(record){currentReceipt=record;$('receipt').hidden=false;$('receipt-info').textContent=`收件編號 ${record.id}｜${new Date(record.created_at).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}（臺北時間）\n狀態：待人工審核`;$('submission-form').hidden=true;}
async function history(){
  const records=await api('/rest/v1/submissions?select=*&order=created_at.desc&limit=100');
  $('history').hidden=false;$('history-list').replaceChildren();
  if(!records.length){$('history-list').textContent='目前尚無投稿。';return;}
  for(const r of records){const row=document.createElement('div');row.className='history-item';const text=document.createElement('div');const title=document.createElement('strong');title.textContent=r.metadata.title;const info=document.createElement('p');info.textContent=`${r.id} · ${{pending:'待審核',approved:'已核准',rejected:'未採用',withdrawal_requested:'已申請撤回',withdrawn:'已撤回'}[r.status]||r.status}`;text.append(title,info);const actions=document.createElement('div');const download=document.createElement('button');download.type='button';download.className='secondary';download.textContent='下載收據';download.onclick=()=>downloadReceipt(r);actions.append(download);
    if(['pending','approved','rejected'].includes(r.status)){const withdraw=document.createElement('button');withdraw.type='button';withdraw.className='secondary';withdraw.textContent='申請撤回';withdraw.onclick=()=>{if(!confirm('確認申請撤回這件作品？收到申請後停止新增使用，研究團隊應於 30 日內處理。'))return;task(async()=>{await api('/rest/v1/rpc/request_withdrawal',{method:'POST',body:{submission_id:r.id}});status('撤回申請已記錄。請保留收件編號，研究團隊將依條款處理。');await history();});};actions.append(withdraw);}row.append(text,actions);$('history-list').append(row);
  }
}
$('email-form').onsubmit=e=>{e.preventDefault();task(async()=>{if(!ready)throw Error('目前尚未開放徵集。');await api('/auth/v1/otp',{method:'POST',body:{email:$('email').value.trim(),create_user:true}});$('otp-form').hidden=false;$('email').readOnly=true;status('驗證碼已寄出，請查看信箱（含垃圾郵件）。');$('otp').focus();});};
$('otp-form').onsubmit=e=>{e.preventDefault();task(async()=>{session=await api('/auth/v1/verify',{method:'POST',body:{email:$('email').value.trim(),token:$('otp').value.trim(),type:'email'}});if(!session.access_token||!session.user?.id){session=null;throw Error('未取得有效驗證，請重新驗證。');}$('auth-state').textContent=`已驗證：${session.user.email}`;$('email-form').hidden=true;$('otp-form').hidden=true;$('logout').hidden=false;$('submission-fields').disabled=false;status('驗證完成，可以填寫作品資訊。');await history();});};
$('logout').onclick=()=>task(async()=>{try{await api('/auth/v1/logout',{method:'POST'});}finally{session=null;location.reload();}});
$('file').onchange=()=>{try{const f=$('file').files[0];if(!f){$('file-info').textContent='尚未選擇檔案';return;}validateFile(f);$('file-info').textContent=`${f.name} · ${(f.size/1024/1024).toFixed(2)} MB`;}catch(e){$('file').value='';$('file-info').textContent=e.message;}};
$('print-terms').onclick=()=>printText($('terms').textContent);
const publicPrint=document.createElement('button');publicPrint.type='button';publicPrint.className='secondary';publicPrint.textContent='列印完整授權條款';publicPrint.onclick=()=>printText($('terms').textContent);$('mode-banner').after(publicPrint);
$('download').onclick=()=>downloadReceipt(currentReceipt);
$('print-receipt').onclick=()=>printText(`客語語料授權收據\n${JSON.stringify(currentReceipt,null,2)}`);
$('another').onclick=()=>{$('receipt').hidden=true;$('submission-form').hidden=false;$('submission-form').reset();$('file-info').textContent='尚未選擇檔案';status('');};
$('submission-form').onsubmit=e=>{e.preventDefault();task(async()=>{
  if(!session||!ready)throw Error('請先完成 Email 驗證。');
  if(Date.now()/1000>=session.expires_at)throw Error('驗證已過期，請登出後重新驗證再提交。');
  const form=new FormData(e.target);const name=form.get('name').trim();const signature=form.get('signature').trim();
  if(name!==signature)throw Error('簽署姓名須與授權人姓名一致。');
  if(!form.get('rights')||!form.get('consent'))throw Error('請閱讀並勾選權利確認與授權同意。');
  const file=$('file').files[0];if(!file)throw Error('請選擇檔案。');const ext=validateFile(file);
  const audio=['mp3','wav','m4a','ogg','flac'].includes(ext);
  if(audio!==(form.get('category')==='hakka-audio'))throw Error('檔案格式與語料類別不一致，請確認文字或語音類別。');
  const metadata=Object.fromEntries(['name','owner','title','category','dialect','source'].map(k=>[k,form.get(k).trim()]));
  if(Object.values(metadata).some(v=>!v))throw Error('請填妥所有必填欄位。');
  $('submission-fields').disabled=true;
  const id=crypto.randomUUID();const path=`${session.user.id}/${id}.${ext}`;let uploaded=false,attempted=false;
  try{
    status('正在計算檔案摘要…');const hash=await sha256(await file.arrayBuffer());
    status('正在上傳私人儲存空間，請勿關閉頁面…');
    await api(`/storage/v1/object/corpus/${path}`,{method:'POST',body:file,raw:true});uploaded=true;
    status('檔案已上傳，正在記錄授權…');attempted=true;
    const record=await api('/rest/v1/rpc/submit_corpus',{method:'POST',body:{submission_id:id,object_path:path,original_name:file.name,file_hash:hash,metadata,signature,terms_version:terms.version,rights_confirmed:true,consent_confirmed:true}});
    showReceipt(record);status('提交完成。請下載收據留存；通過人工審核前不投入訓練。');await history();
  }catch(error){
    // An ambiguous network failure may follow a successful commit. Never delete a signed object.
    if(attempted){try{const rows=await api(`/rest/v1/submissions?id=eq.${id}&select=*`);if(rows.length){showReceipt(rows[0]);status('已確認收件成功，請下載授權收據。');await history();return;}}catch{status(`連線中斷，無法確認結果。請勿立即重複投稿；重新驗證後查看投稿紀錄。查詢編號：${id}`,true);return;}}
    if(uploaded){try{await api('/storage/v1/object/corpus',{method:'DELETE',body:{prefixes:[path]}});}catch{status(`提交未完成；暫存檔清理失敗，請聯絡窗口。查詢編號：${id}`,true);return;}}
    throw error;
  }finally{$('submission-fields').disabled=false;}
});};
async function init(){try{
  [config,terms]=await Promise.all([fetch('/config.json').then(r=>r.json()),fetch('/terms.json').then(r=>r.json())]);renderTerms();
  if(config.enabled&&config.supabaseUrl&&config.supabaseKey){const rows=await api('/rest/v1/license_versions?active=eq.true&select=*');if(rows.length===1){terms=rows[0].document;ready=terms.approved===true&&Boolean(terms.contact)&&!terms.contact.includes('待')&&!terms.region.includes('待');renderTerms();}}
  $('mode-banner').textContent=ready?'徵集已開放｜原始檔案不公開，提交後先經人工審核。':'網站預覽｜正式授權單位、聯絡窗口及資料處理地區確認前，不收集個資、不開放投稿。您可以先閱讀說帖與條款。';
  $('email-form').querySelector('button').disabled=!ready;$('email').disabled=!ready;
  if(ready)$('contact').textContent=`授權／個資聯絡：${terms.contact}｜處理地區：${terms.region}`;
}catch{$('mode-banner').textContent='暫時無法取得徵集設定，為保護資料，目前不接受投稿。';$('email-form').querySelector('button').disabled=true;}}
init();
