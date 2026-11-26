export const MAX_SIZE=50*1024*1024;
export const extensions=['txt','md','csv','docx','pdf','mp3','wav','m4a','ogg','flac'];
export function validateFile(file){
  const ext=file.name.split('.').pop().toLowerCase();
  if(!extensions.includes(ext))throw Error('請選擇支援的文字、文件或語音格式。');
  if(!file.size || file.size>MAX_SIZE)throw Error('檔案必須大於 0 且不超過 50 MB。');
  return ext;
}
export async function sha256(buffer){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(v=>v.toString(16).padStart(2,'0')).join('');}
export function downloadReceipt(record){
  const blob=new Blob([JSON.stringify(record,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`客語語料授權-${record.id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
