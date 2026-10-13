// No ZIP inbox: use Chrome's completed download path after explicit file:// access.
const OPENAI_HOST = /(^|\.)(chatgpt\.com|chat\.openai\.com|openai\.com|oaiusercontent\.com|oaistatic\.com)$/i;
const isZip = name => /\.zip$/i.test(String(name||''));
const trustedSource = raw => {
  try { const u=new URL(raw); if(u.protocol==='blob:')return trustedSource(u.pathname); return OPENAI_HOST.test(u.hostname); } catch {return false;}
};
const basename = name => String(name||'').split(/[\\/]/).pop() || '';
function absoluteFileUrl(path) {
  const input=String(path||'');
  if(/^\\/.test(input) || /^\/\//.test(input)) throw new Error('Đường dẫn mạng không được hỗ trợ; hãy dùng “Chọn ZIP cập nhật”.');
  const p=input.replaceAll('\\','/');
  if(!p.startsWith('/')&&!/^[A-Za-z]:\//.test(p))throw new Error('Đường dẫn ZIP không hợp lệ.');
  const prefix=p.startsWith('/')?'file://':'file:///';
  return prefix+p.split('/').map((x,i)=>i===0&&/^[A-Za-z]:$/.test(x)?x:encodeURIComponent(x)).join('/');
}
let creatingOffscreen;

async function log(text, type='info') {
  const data=await chrome.storage.local.get('activity');
  const activity=[{at:new Date().toISOString(),text,type},...(data.activity||[])].slice(0,35);
  await chrome.storage.local.set({activity});
}
async function updateAssignment(id,value) {
  const data=await chrome.storage.local.get('assignments');
  const assignments=data.assignments||{};
  if(value) assignments[id]=value;else delete assignments[id];
  await chrome.storage.local.set({assignments});
}
async function recentCandidate(item) {
  const {intents=[]}=await chrome.storage.session.get('intents');
  const now=Date.now();
  const recent=intents.filter(x=>now-x.at<30000);
  // Downloads API does not expose a tabId. Never guess if simultaneous chats clicked.
  const unique=[...new Set(recent.map(x=>x.chatId))];
  if(unique.length!==1 || !recent.length) return null;
  const selected=recent[recent.length-1];
  const ref=item.referrer || '';
  if (ref) {
    try {
      const url=new URL(ref);
      if(!trustedSource(ref))return null;
      const m=url.pathname.match(/(?:^|\/)c\/([A-Za-z0-9-]{8,})(?:\/|$)/);
      if(m && m[1]!==selected.chatId)return null;
    }catch{return null;}
  } else {
    // Strictly require ChatGPT/OpenAI download origins when Referer is absent.
    let ok=false;
    for(const raw of [item.url,item.finalUrl]){
      if(trustedSource(raw))ok=true;
    }
    if(!ok)return null;
  }
  const {mappings={}}=await chrome.storage.local.get('mappings');
  return mappings[selected.chatId]?.auto ? selected : null;
}

// Fallback for ZIP downloads that do not expose a recognizable Download button.
// Never guess from other websites or from different chat tabs.
async function activeChatCandidate(item) {
  const urls=[item.referrer,item.url,item.finalUrl].filter(Boolean);
  if (!urls.some(trustedSource))
    return {reason:'Nguồn tải ZIP không thuộc ChatGPT/OpenAI đã cho phép'};
  if (item.referrer) {
    try { if (!trustedSource(item.referrer))return {reason:'Trang giới thiệu lượt tải không thuộc ChatGPT'}; }
    catch {return {reason:'Đường dẫn nguồn không hợp lệ'};}
  }
  const tabs=await chrome.tabs.query({active:true,lastFocusedWindow:true});
  const tab=tabs[0];
  if(!tab) return {reason:'Không tìm thấy tab Chrome đang hoạt động'};
  const match=(tab.url||'').match(/^https:\/\/(?:chatgpt\.com|chat\.openai\.com)\/(?:[^?#]*\/)?c\/([A-Za-z0-9-]{8,})(?:[/?#]|$)/);
  if(!match)return {reason:'Tab đang mở không phải cuộc chat cụ thể trên ChatGPT'};
  const chatId=match[1];
  const {mappings={}}=await chrome.storage.local.get('mappings');
  if(!mappings[chatId]?.auto)return {reason:'Chat đang mở chưa được liên kết hoặc đã tắt tự đồng bộ'};
  const {intents=[]}=await chrome.storage.session.get('intents');
  const recent=intents.filter(x=>Date.now()-x.at<30000);
  if(recent.some(x=>x.chatId!==chatId))return {reason:'Có lượt tải từ chat khác gần đây; không tự đoán chat đích'};
  if(item.referrer){
    const m=new URL(item.referrer).pathname.match(/(?:^|\/)c\/([A-Za-z0-9-]{8,})(?:\/|$)/);
    if(m&&m[1]!==chatId)return {reason:'Nguồn tải ghi nhận ID chat khác'};
  }
  return {intent:{chatId,tabId:tab.id,at:Date.now()},mode:'active-tab'};
}
async function inspectRecentDownloads() {
  const rows=await chrome.downloads.search({limit:10,orderBy:['-startTime']});
  const zips=rows.filter(item=>isZip(basename(item.filename))||/zip/i.test(item.mime||''));
  const {assignments={},pending={}}=await chrome.storage.local.get(['assignments','pending']);
  return zips.slice(0,5).map(item=>({id:item.id,name:basename(item.filename),state:item.state,routed:!!assignments[item.id],pending:!!pending[item.id],date:item.startTime}));
}

chrome.runtime.onInstalled.addListener(()=>{
  chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});
});
chrome.runtime.onStartup.addListener(()=>{
  chrome.sidePanel.setPanelBehavior({openPanelOnActionClick:true}).catch(()=>{});
});

chrome.runtime.onMessage.addListener((msg,sender,respond)=>{
  if (msg?.kind==='CLICK_DOWNLOAD') {
    (async()=>{
      if (!sender.tab || !/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(sender.url||''))return;
      const actual=(sender.url||'').match(/(?:^|\/)c\/([A-Za-z0-9-]{8,})(?:\/|$)/)?.[1];
      if(actual!==msg.chatId)return;
      const {mappings={}}=await chrome.storage.local.get('mappings');
      if(!mappings[actual]?.auto)return;
      const {intents=[]}=await chrome.storage.session.get('intents');
      const next=[...intents.filter(x=>Date.now()-x.at<120000 && !(x.tabId===sender.tab.id && Date.now()-x.at<1200)),{chatId:actual,tabId:sender.tab.id,at:Date.now(),href:String(msg.href||'').slice(0,1200)}].slice(-8);
      await chrome.storage.session.set({intents:next});
    })().catch(()=>{});
    respond({ok:true});return false;
  }
  if (msg?.kind==='CHECK_DOWNLOADS') {
    inspectRecentDownloads().then(rows=>respond({rows}),e=>respond({error:String(e.message||e)}));return true;
  }
  if (msg?.kind==='MANUAL_SYNC') {
    (async()=>{
      const chatId=msg.chatId;
      const {mappings={}}=await chrome.storage.local.get('mappings');
      if(!mappings[chatId]?.auto)throw new Error('Chat này chưa được liên kết hoặc đang tắt đồng bộ');
      await ensureOffscreen();
      const res=await chrome.runtime.sendMessage({target:'OFFSCREEN',kind:'PROCESS_ZIP',chatId,manual:true,mapping:{auto:true,folderName:mappings[chatId].folderName,rootMode:mappings[chatId].rootMode,stripRoot:!!mappings[chatId].stripRoot}});
      if(!res?.ok)throw new Error(res?.error||'Không xử lý được ZIP');
      mappings[chatId]={...mappings[chatId],lastUpdated:Date.now(),lastResult:res.result};
      await chrome.storage.local.set({mappings});
      await log('Nhập ZIP thủ công: cập nhật '+res.result.updated+' file'+(res.result.stripped?' (bỏ lớp '+res.result.wrapper+'/ trong ZIP)':'')+' → '+mappings[chatId].folderName,'success');
      return {ok:true,result:res.result};
    })().then(respond,e=>{log('Nhập ZIP thủ công thất bại: '+String(e.message||e),'error').catch(()=>{});respond({error:String(e.message||e)});});return true;
  }
  if (msg?.kind==='RETRY_SYNC') {
    (async()=>{
      const {pending={}}=await chrome.storage.local.get('pending');
      const data=pending[msg.id]; if(!data)throw new Error('Không thấy ZIP cần xử lý');
      await processDownload(Number(msg.id),data);return {ok:true};
    })().then(respond,e=>respond({error:String(e.message||e)}));return true;
  }
  if (msg?.kind==='GET_CHAT') {
    (async()=>{
      const tabs=await chrome.tabs.query({active:true,currentWindow:true});
      const tab=tabs[0];
      // Proper URL parser for /g/.../c/... instead of regex with ^ in middle.
      let chatId=null;
      try {const u=new URL(tab.url);if(['chatgpt.com','chat.openai.com'].includes(u.hostname))chatId=u.pathname.match(/(?:^|\/)c\/([A-Za-z0-9-]{8,})(?:\/|$)/)?.[1]||null;}catch{}
      return {chatId,title:tab?.title||'',url:tab?.url||'',tabId:tab?.id||null};
    })().then(respond,e=>respond({error:String(e.message||e)}));return true;
  }
  return false;
});

chrome.downloads.onDeterminingFilename.addListener((item,suggest)=>{
  (async()=>{
    if(!isZip(basename(item.filename)) && !/application\/(?:zip|x-zip-compressed)/i.test(item.mime||''))return suggest();
    // Download locations are no longer changed; Chrome uses its normal Downloads directory.
    let intent=await recentCandidate(item), route='click';
    if(!intent){await new Promise(r=>setTimeout(r,900));intent=await recentCandidate(item);}
    if(!intent){
      const fallback=await activeChatCandidate(item);
      if(fallback.intent){intent=fallback.intent;route=fallback.mode;}
      else {await log('Đã thấy ZIP nhưng KHÔNG đồng bộ: '+basename(item.filename)+' — '+fallback.reason,'warning');return suggest();}
    }
    const filename=basename(item.filename);
    await updateAssignment(item.id,{chatId:intent.chatId,filename,createdAt:Date.now()});
    await log('Đã nhận ZIP ('+route+') từ chat '+intent.chatId.slice(0,12)+'…: '+filename);
    suggest(); // Do not rename or move the user's download.

  })().catch(err=>{console.error('ChatPatch filename',err);suggest();});
  return true;
});

chrome.downloads.onChanged.addListener(delta=>{
  if(delta.state?.current==='complete') {
    (async()=>{
      const {assignments={}}=await chrome.storage.local.get('assignments');
      const assignment=assignments[delta.id];if(!assignment)return;
      const matches=await chrome.downloads.search({id:delta.id});
      const item=matches[0];if(!item || item.state!=='complete')return;
      // Use the filename Chrome actually wrote; it might have been uniquified.
      const data={...assignment,filename:basename(item.filename)};
      const {pending={}}=await chrome.storage.local.get('pending');
      pending[delta.id]=data;
      await chrome.storage.local.set({pending});
      await processDownload(delta.id,data);
    })().catch(e=>log('Không xử lý được ZIP: '+e.message,'error'));
  }
});
async function ensureOffscreen() {
  if(creatingOffscreen)return creatingOffscreen;
  creatingOffscreen=(async()=>{
    const contexts=await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT'],documentUrls:[chrome.runtime.getURL('offscreen.html')]});
    if(!contexts.length)await chrome.offscreen.createDocument({url:'offscreen.html',reasons:['BLOBS'],justification:'Đọc ZIP mà Chrome vừa tải sau khi người dùng bật quyền file URLs và cập nhật source code.'});
  })();
  try {await creatingOffscreen;}finally{creatingOffscreen=null;}
}
async function processDownload(id,assignment){
  try{
    const {mappings:currentMappings={}}=await chrome.storage.local.get('mappings');
    const currentMapping=currentMappings[assignment.chatId];
    if (!currentMapping?.auto) throw new Error('Cuộc chat đã hủy liên kết hoặc tắt tự đồng bộ');
    if(!(await chrome.extension.isAllowedFileSchemeAccess())){
      throw new Error('Chrome chưa bật “Allow access to file URLs” cho ChatPatch. Vào chrome://extensions → ChatPatch → Details để bật; sau đó thử lại ZIP.');
    }
    const matches=await chrome.downloads.search({id});
    const download=matches[0];
    if(!download || download.state!=='complete' || !isZip(basename(download.filename)))
      throw new Error('File ZIP tải xuống đã bị di chuyển/xóa hoặc chưa hoàn tất. Hãy tải lại hoặc dùng “Chọn ZIP cập nhật”.');
    const fileUrl=absoluteFileUrl(download.filename);
    await ensureOffscreen();
    const response=await chrome.runtime.sendMessage({target:'OFFSCREEN',kind:'PROCESS_ZIP',downloadId:id,chatId:assignment.chatId,filename:basename(download.filename),fileUrl,mapping:{auto:true,folderName:currentMapping.folderName,rootMode:currentMapping.rootMode,stripRoot:!!currentMapping.stripRoot}});
    if(!response?.ok)throw new Error(response?.error||'Không có phản hồi từ trình xử lý ZIP');
    const {pending={}}=await chrome.storage.local.get('pending');delete pending[id];
    const {assignments={}}=await chrome.storage.local.get('assignments');delete assignments[id];
    const {mappings={}}=await chrome.storage.local.get('mappings');
    if(mappings[assignment.chatId]) mappings[assignment.chatId]={...mappings[assignment.chatId],lastUpdated:Date.now(),lastResult:response.result};
    await chrome.storage.local.set({pending,assignments,mappings});
    await log('Đồng bộ '+response.result.updated+' file, '+response.result.unchanged+' không đổi'+(response.result.stripped?' (bỏ lớp '+response.result.wrapper+'/ trong ZIP)':'')+' → '+(mappings[assignment.chatId]?.folderName||'thư mục'),'success');
  }catch(e){await log('Chưa thể đồng bộ '+assignment.filename+': '+e.message,'error');}
}
