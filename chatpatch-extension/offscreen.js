import {getHandle} from './db.mjs';
import {MAX_ZIP_BYTES, MAX_TOTAL_BYTES, inspectZipHeaders, mapArchivePaths, isBlockedPath} from './zip-safety.mjs';

const requireAccess=async(handle,mode='read')=>{
  if(!handle)throw new Error('Chưa cấp quyền cho thư mục cần dùng. Mở bảng điều khiển và chọn thư mục.');
  if((await handle.queryPermission({mode}))!=='granted')throw new Error('Quyền truy cập thư mục đã hết hạn. Mở ChatPatch và nhấn "Cấp lại quyền".');
};
const dirAt=async(root,parts,create=false)=>{
  let curr=root;
  for(const part of parts)curr=await curr.getDirectoryHandle(part,{create});
  return curr;
};
const fileAt=async(root,path,create=false)=>{
  const parts=path.split('/');const dir=await dirAt(root,parts.slice(0,-1),create);
  return dir.getFileHandle(parts[parts.length-1],{create});
};
const existFile=async(root,path)=>{
  try{return await fileAt(root,path,false);}catch(e){if(e?.name==='NotFoundError')return null;throw e;}
};
const bytesSame=(a,b)=>a.byteLength===b.byteLength&&a.every((v,i)=>v===b[i]);
const write=async(fileHandle,bytes)=>{
  const w=await fileHandle.createWritable();
  try{await w.write(bytes);await w.close();}catch(e){try{await w.abort();}catch{}throw e;}
};
function uniqueStamp(chatId){return new Date().toISOString().replace(/[:.]/g,'-')+'-'+chatId.slice(0,12);}
// Missing files can occur when Chrome finishes a download but the File System
// Access handle has not yet observed it, or when the user moves a folder/file.
const isMissing = e => e?.name === 'NotFoundError' || /A requested file or directory could not be found/i.test(String(e?.message || ''));
async function atStage(stage, run, hint='') {
  try { return await run(); }
  catch (e) {
    if (isMissing(e)) throw new Error(`${stage} không còn tồn tại hoặc đã bị di chuyển.${hint ? ' ' + hint : ''}`);
    throw e;
  }
}
async function getDownloadedFile(fileUrl, filename) {
  if(typeof fileUrl!=='string'||!fileUrl.startsWith('file:///')||!filename?.toLowerCase().endsWith('.zip'))
    throw new Error('Nguồn ZIP tải xuống không hợp lệ.');
  // Offscreen's extension origin can fetch file URLs only after user enables
  // "Allow access to file URLs" in the extension details page.
  for(let attempt=0;attempt<3;attempt++){
    try {
      const response=await fetch(fileUrl,{cache:'no-store'});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const data=await response.arrayBuffer();
      return {name:filename,size:data.byteLength,arrayBuffer:async()=>data};
    }catch(error){
      if(attempt===2)throw new Error('Chrome không đọc được ZIP vừa tải qua file URL ('+error.message+'). Hãy bật “Allow access to file URLs”, kiểm tra ZIP còn trong Downloads, hoặc dùng “Chọn ZIP cập nhật”.');
      await new Promise(resolve=>setTimeout(resolve,350*(attempt+1)));
    }
  }
}
async function importZip({chatId,filename,fileUrl,manual=false,mapping}) {
  // Offscreen documents only expose chrome.runtime, NOT chrome.storage.
  // The background service worker reads the current mapping and sends it in each request.
  if (!mapping?.auto || typeof mapping.folderName !== 'string')
    throw new Error('Cuộc chat không còn được bật đồng bộ hoặc thiếu cấu hình thư mục');
  const project=await getHandle('project:'+chatId);
  await atStage('Thư mục dự án '+(project?.name||'đã liên kết'),()=>requireAccess(project,'readwrite'),'Hãy chọn lại thư mục dự án trong ChatPatch.');
  if(project.name!==mapping.folderName)throw new Error('Thư mục được liên kết đã thay đổi');
  const zipFile=manual
    ? await atStage('File ZIP đã chọn',async()=>{
        const picked=await getHandle('manual-zip:'+chatId);
        if(!picked)throw new Error('Hãy nhấn “Chọn ZIP cập nhật” và chọn lại file.');
        return picked.getFile();
      },'Hãy chọn lại ZIP.')
    : await getDownloadedFile(fileUrl,filename);
  if(!zipFile.name.toLowerCase().endsWith('.zip'))throw new Error('Chỉ hỗ trợ file ZIP');
  if(zipFile.size > MAX_ZIP_BYTES)throw new Error('ZIP vượt 30 MB');
  const content=await zipFile.arrayBuffer();
  const entries=inspectZipHeaders(content);
  // Directory root names decide whether one outer ZIP folder is merely packaging.
  // Legacy stripRoot=true is treated as an explicit 'always' override.
  const destNames=[];
  await atStage('Thư mục dự án '+project.name,async()=>{for await(const name of project.keys())destNames.push(name);},'Hãy mở đúng cuộc chat và chọn lại thư mục source bằng nút “Liên kết thư mục với chat này”.');
  const mode=mapping.rootMode || (mapping.stripRoot?'always':'auto');
  const mapped=mapArchivePaths(entries,project.name,mode,destNames);
  const archive=await JSZip.loadAsync(content,{checkCRC32:true});
  // Pre-validate and inflate EVERY file before writing ANY source file.
  const candidates=[]; let aggregate=0;
  for(const item of mapped.files) {
    if(isBlockedPath(item.path))continue;
    const entry=archive.file(item.name);
    if(!entry || entry.dir)throw new Error('ZIP thiếu file '+item.name);
    const bytes=await entry.async('uint8array');
    if(bytes.byteLength!==item.size)throw new Error('Dung lượng file ZIP không khớp: '+item.name);
    aggregate+=bytes.byteLength;if(aggregate>MAX_TOTAL_BYTES)throw new Error('ZIP vượt giới hạn giải nén 120 MB');
    candidates.push({path:item.path,bytes});
  }
  const edits=[];let unchanged=0;
  for(const file of candidates){
    const oldHandle=await atStage('Đường dẫn file '+file.path,()=>existFile(project,file.path),'Kiểm tra thư mục source có bị di chuyển hay xóa.');
    if(oldHandle) {
      const oldFile=await atStage('File source '+file.path,()=>oldHandle.getFile(),'File có thể vừa được ứng dụng khác xóa hoặc đổi tên.');const old=new Uint8Array(await oldFile.arrayBuffer());
      if(bytesSame(old,file.bytes)){unchanged++;continue;}
      edits.push({...file,old});
    } else edits.push({...file,old:null});
  }
  if(edits.length===0)return {updated:0,unchanged,skipped:mapped.skipped,backup:'Không cần sao lưu',stripped:mapped.stripped,wrapper:mapped.wrapper};
  // Stage backups before writing. Keep them inside the granted workspace.
  const backupRoot=await atStage('Thư mục dự án '+project.name,()=>project.getDirectoryHandle('.chatpatch-backups',{create:true}),'Hãy liên kết lại thư mục source trong ChatPatch.');
  const backupDir=await atStage('Thư mục sao lưu .chatpatch-backups',()=>backupRoot.getDirectoryHandle(uniqueStamp(chatId),{create:true}),'Hãy kiểm tra thư mục dự án còn tồn tại và có quyền ghi.');
  for(const edit of edits){
    if(edit.old!==null){
      const f=await atStage('Đường dẫn sao lưu '+edit.path,()=>fileAt(backupDir,edit.path,true),'Chưa bắt đầu ghi thay đổi vào source.');
      await atStage('File sao lưu '+edit.path,()=>write(f,edit.old),'Chưa bắt đầu ghi thay đổi vào source.');
    }
  }
  let updated=0;
  try{
    for(const edit of edits){
      const target=await atStage('Đường dẫn đích '+edit.path,()=>fileAt(project,edit.path,true),'Kiểm tra file/thư mục có bị di chuyển trong lúc đồng bộ.');
      await atStage('File đích '+edit.path,()=>write(target,edit.bytes),'Kiểm tra quyền ghi và các thao tác đang thay đổi file.');
      updated++;
    }
  }catch(e){throw new Error('Đã cập nhật '+updated+'/'+edits.length+' file trước khi lỗi: '+e.message+'. Bản sao lưu trong .chatpatch-backups (cần kiểm tra).');}
  return {updated,unchanged,skipped:mapped.skipped,backup:backupDir.name,stripped:mapped.stripped,wrapper:mapped.wrapper};
}
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
  if(msg?.target!=='OFFSCREEN'||msg.kind!=='PROCESS_ZIP')return;
  importZip(msg).then(result=>sendResponse({ok:true,result}),err=>sendResponse({ok:false,error:String(err.message||err)}));
  return true;
});
