import {getHandle,putHandle,delHandle} from './db.mjs';
import {chatIdFromUrl} from './zip-safety.mjs';
import {readPermissionState, firstRestorable, summarizePermissions} from './permissions.mjs';
import {translate, normalizeLanguage, translateActivity, translateError} from './i18n.mjs';
const $=id=>document.getElementById(id);
let current={chatId:null,url:'',title:''};let mappings={};let language='vi';
const t=(key,vars)=>translate(language,key,vars);
const pLabel=state=>t('status.'+(['granted','prompt','denied','missing','migration'].includes(state)?state:'error'));
function translateStatic(){
 document.documentElement.lang=language;
 document.querySelectorAll('[data-i18n]').forEach(node=>node.textContent=t(node.dataset.i18n));
 document.querySelectorAll('[data-i18n-title]').forEach(node=>{node.title=t(node.dataset.i18nTitle);node.setAttribute('aria-label',node.title);});
 $('lang-select').value=language;
}

const accessHandles=new Map();
let accessStates=new Map();
let noticeTimer;
function notice(text,error=false){const el=$('notice');el.textContent=translateError(language,text);el.className='notice show'+(error?' error':'');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>el.className='notice',7000);}
function el(tag,className,text){const x=document.createElement(tag);if(className)x.className=className;if(text!=null)x.textContent=text;return x;}
function button(text,cls,fn){const b=el('button',cls,text);b.addEventListener('click',()=>Promise.resolve(fn()).catch(e=>notice(e.message,true)));return b;}
function shorten(id){return id?.length>21?id.slice(0,16)+'…':id||'';}
async function saveMappings(){await chrome.storage.local.set({mappings});await renderLinks();}
async function getCurrent(){
 const tabs=await chrome.tabs.query({active:true,currentWindow:true});const tab=tabs[0];
 current={chatId:chatIdFromUrl(tab?.url),title:tab?.title||'',url:tab?.url||'',tabId:tab?.id||null};
 const box=$('current');box.replaceChildren();
 if(current.chatId){
  box.append(el('div','chat-title',current.title.replace(/\s*[-–] ChatGPT\s*$/,'')||t('chat.defaultTitle')));
  box.append(el('div','mono','ID: '+current.chatId));
  if(mappings[current.chatId])box.append(el('div','folder',t('chat.folderLink',{folder:mappings[current.chatId].folderName})));
  $('link-folder').textContent=mappings[current.chatId]?t('chat.change'):t('chat.link');
  $('link-folder').disabled=false;
  $('unlink-folder').classList.toggle('hidden',!mappings[current.chatId]);
  $('current-help').textContent=t(mappings[current.chatId]?'chat.connectedHelp':'chat.unlinkedHelp');
 }else{
  box.append(el('div','secondary-text',t('chat.notOpen')));
  $('link-folder').disabled=true;$('unlink-folder').classList.add('hidden');
  $('current-help').textContent=t('chat.notOpenHelp');
 }
}
// The side panel keeps handles in memory. Permission prompts must start
// synchronously in a user click, not after one or more IDB awaits.
async function loadSavedHandles(){
 const keys=Object.keys(mappings).map(id=>'project:'+id);
 await Promise.all(keys.map(async key=>{
  const handle=await getHandle(key);
  if(handle)accessHandles.set(key,handle);
  else accessHandles.delete(key);
 }));
 for(const key of [...accessHandles.keys()]){
  if(key.startsWith('project:')&&mappings[key.slice(8)])continue;
  accessHandles.delete(key);
 }
}
function accessEntries(){
 return [
  ...Object.keys(mappings).map(id=>({key:'project:'+id,handle:accessHandles.get('project:'+id),mode:'readwrite',state:accessStates.get('project:'+id)||'missing'}))
 ];
}
async function refreshAccess(){
 const entries=accessEntries();
 await Promise.all(entries.map(async x=>{
  const state=await readPermissionState(x.handle,x.mode);
  accessStates.set(x.key,state);
 }));
 const summary=summarizePermissions(accessEntries());
 $('permission-summary').textContent=summary.total===0?t('access.none'):t('access.summary',{granted:summary.granted,total:summary.total})+' '+t(summary.remaining?'access.remaining':'access.ready');
 $('reauthorize').disabled=summary.remaining===0;
 $('reauthorize').textContent=t(summary.remaining?'access.restore':'access.allGranted');
 await renderLinks();
}
function requestAccessFor(key){
 const entry=accessEntries().find(x=>x.key===key);
 if(!entry?.handle){
  notice(t('notice.missingProject'),true);
  return;
 }
 // IMPORTANT: requestPermission() is CALLED RIGHT HERE, inside the click
 // handler, BEFORE any awaited operation can consume transient activation.
 let task;
 try {task=entry.handle.requestPermission({mode:entry.mode});}
 catch(e){notice(t('notice.permissionDialog',{details:e.message}),true);return;}
 Promise.resolve(task).then(async result=>{
  await refreshAccess();
  if(result==='granted'){
   const left=summarizePermissions(accessEntries()).remaining;
   notice(left?t('notice.permissionGrantedRemaining',{folder:entry.handle.name,remaining:left}):t('notice.permissionGranted'));
  }else notice(t('notice.permissionResult',{result,folder:entry.handle.name}),true);
 }).catch(async e=>{
  await refreshAccess();
  notice(t('notice.permissionFail',{folder:entry.handle.name,details:e.message}),true);
 });
}
async function renderLinks(){
 const wrapper=$('links');wrapper.replaceChildren();const rows=Object.entries(mappings);
 $('linked-count').textContent=String(rows.length);
 if(!rows.length){wrapper.append(el('p','muted',t('links.empty')));return;}
 for(const [id,m] of rows){
  const row=el('div','linkrow');const top=el('div','rowtop');const info=el('div');
  info.append(el('div','chat-title',m.title||t('links.defaultTitle')));
  info.append(el('div','mono',shorten(id)));
  info.append(el('div','folder',m.folderName+' · '+pLabel(accessStates.get('project:'+id)||'missing')));
  top.append(info);top.append(button(t(m.auto?'links.enabled':'links.disabled'),'toggle'+(m.auto?' on':''),async()=>{
    mappings[id]={...mappings[id],auto:!mappings[id].auto};await saveMappings();notice(t('notice.toggled'));
  }));row.append(top);
  const bottom=el('div','rowactions');
  if(accessStates.get('project:'+id)!=='granted')bottom.append(button(t('links.permission'),'secondary smallbtn',()=>requestAccessFor('project:'+id)));
  const a=el('a','', t('links.open'));a.href=m.url||'https://chatgpt.com/c/'+id;a.target='_blank';a.rel='noopener';bottom.append(a);
  // Automatic mode flattens packaging folders but preserves src/, public/, etc.
  const mode=m.rootMode || (m.stripRoot?'always':'auto');
  const rootLabels={auto:t('root.auto'),always:t('root.always'),never:t('root.never')};
  bottom.append(button(rootLabels[mode]||rootLabels.auto,'secondary smallbtn',async()=>{
    const choices=['auto','always','never'];
    const next=choices[(choices.indexOf(mappings[id].rootMode || (mappings[id].stripRoot?'always':'auto'))+1)%3];
    mappings[id].rootMode=next;
    await saveMappings();
    notice(t(next==='auto'?'root.noticeAuto':next==='always'?'root.noticeAlways':'root.noticeNever'));
  }));
  if(m.lastResult)bottom.append(el('span','detail-line',t('links.lastSynced',{count:m.lastResult.updated})));
  row.append(bottom);wrapper.append(row);
 }
}
async function renderEvents(){
 const {activity=[],pending={}}=await chrome.storage.local.get(['activity','pending']);const wrap=$('events');wrap.replaceChildren();
 for(const [id,p] of Object.entries(pending)){
  const node=el('div','event error');node.append(el('div','time',t('activity.pending',{file:p.filename})));
  node.append(button(t('activity.retryOne'),'secondary smallbtn',async()=>{
    const resp=await chrome.runtime.sendMessage({kind:'RETRY_SYNC',id});if(resp?.error)throw new Error(resp.error);notice(t('notice.retrySent'));
  }));wrap.append(node);
 }
 if(!activity.length&&!Object.keys(pending).length){wrap.append(el('p','muted',t('activity.empty')));return;}
 for(const item of activity.slice(0,15)){
  const node=el('div','event '+(item.type||''));
  node.append(el('div','time',new Date(item.at).toLocaleString(language==='vi'?'vi-VN':'en-US')));
  node.append(el('div','message',translateActivity(language,item.text)));wrap.append(node);
 }
}
async function setup(){
 const data=await chrome.storage.local.get(['mappings','uiLanguage']);mappings=data.mappings||{};language=normalizeLanguage(data.uiLanguage);translateStatic();
 await loadSavedHandles();
 await refreshAccess();
 await Promise.all([getCurrent(),renderEvents(),refreshFileAccess()]);
}
$('lang-select').addEventListener('change',async event=>{
 language=normalizeLanguage(event.target.value);
 await chrome.storage.local.set({uiLanguage:language});
 translateStatic();
 await Promise.all([getCurrent(),refreshAccess(),renderEvents()]);
});
$('refresh-chat').addEventListener('click',()=>getCurrent().catch(e=>notice(e.message,true)));
async function refreshFileAccess(){
  const allowed=await chrome.extension.isAllowedFileSchemeAccess();
  $('file-badge').textContent=t(allowed?'files.granted':'files.missing');
  $('file-permission-info').textContent=t(allowed?'files.ready':'files.help');
}
$('file-permission').addEventListener('click',()=>{
  chrome.tabs.create({url:'chrome://extensions/?id='+chrome.runtime.id});
});
$('link-folder').addEventListener('click',async()=>{
 if(!current.chatId)return notice(t('notice.openChatFirst'),true);
 try{
  // IMPORTANT: Picker invoked directly from user gesture (no await before it).
  const folder=await window.showDirectoryPicker({mode:'readwrite',id:'chatpatch-project'});
  if(folder.name==='.chatpatch-backups')throw new Error(t('notice.invalidSource'));
  accessHandles.set('project:'+current.chatId,folder);
  await putHandle('project:'+current.chatId,folder);
  mappings[current.chatId]={chatId:current.chatId,title:current.title.replace(/\s*[-–] ChatGPT\s*$/,''),url:current.url,folderName:folder.name,auto:true,rootMode:mappings[current.chatId]?.rootMode || (mappings[current.chatId]?.stripRoot?'always':'auto'),createdAt:Date.now()};
  await saveMappings();await refreshAccess();await getCurrent();notice(t('notice.linked',{folder:folder.name}));
 }catch(e){if(e.name!=='AbortError')notice(e.message,true);}
});
$('unlink-folder').addEventListener('click',async()=>{
 if(!current.chatId||!mappings[current.chatId])return;
 if(!confirm(t('notice.confirmUnlink')))return;
 await delHandle('project:'+current.chatId);accessHandles.delete('project:'+current.chatId);accessStates.delete('project:'+current.chatId);delete mappings[current.chatId];await saveMappings();await refreshAccess();await getCurrent();notice(t('notice.unlinked'));
});
$('reauthorize').addEventListener('click',()=>{
 // Only request ONE handle per click; looping through async permission dialogs
 // loses user activation and falsely reports that every permission was restored.
 const entries=accessEntries();
 const next=firstRestorable(entries);
 if(next)return requestAccessFor(next.key);
 if(entries.some(x=>x.state==='missing'))return notice(t('notice.reselectMissing'),true);
 notice(t('notice.allGranted'));
});
$('check-downloads').addEventListener('click',async()=>{
 const r=await chrome.runtime.sendMessage({kind:'CHECK_DOWNLOADS'});
 if(r?.error)return notice(r.error,true);
 const rows=r.rows||[];
 $('download-results').textContent=rows.length ? rows.map(x=>`${x.name} — ${t('download.state.'+x.state)} — ${t(x.routed?'download.routed':'download.notRouted')}${x.pending?' ('+t('download.pending')+')':''}`).join(' | ') : t('download.empty');
 await renderEvents();
});
$('manual-zip').addEventListener('click',async()=>{
 if(!current.chatId||!mappings[current.chatId]?.auto)return notice(t('notice.manualNeedsChat'),true);
 try {
  const [file]=await window.showOpenFilePicker({id:'chatpatch-manual-zip',multiple:false,types:[{description:'ZIP',accept:{'application/zip':['.zip']}}],excludeAcceptAllOption:true});
  if(!file||!file.name.toLowerCase().endsWith('.zip'))throw new Error(t('notice.chooseZip'));
  await putHandle('manual-zip:'+current.chatId,file);
  notice(t('notice.manualProcessing',{folder:mappings[current.chatId].folderName}));
  const r=await chrome.runtime.sendMessage({kind:'MANUAL_SYNC',chatId:current.chatId});
  if(r?.error)throw new Error(r.error);
  notice(t('notice.manualSuccess',{updated:r.result.updated,unchanged:r.result.unchanged}));
 } catch(e) {if(e.name!=='AbortError')notice(e.message,true);}
});
$('retry-all').addEventListener('click',async()=>{
 const {pending={}}=await chrome.storage.local.get('pending');
 const ids=Object.keys(pending);if(!ids.length)return notice(t('notice.noFailed'));
 for(const id of ids){await chrome.runtime.sendMessage({kind:'RETRY_SYNC',id});}
 notice(t('notice.retryAll',{count:ids.length}));
});
chrome.storage.onChanged.addListener((changes,area)=>{
 if(area!=='local')return;
 if(changes.mappings){mappings=changes.mappings.newValue||{};loadSavedHandles().then(refreshAccess).catch(()=>{});getCurrent().catch(()=>{});}
 if(changes.uiLanguage){language=normalizeLanguage(changes.uiLanguage.newValue);translateStatic();Promise.all([getCurrent(),refreshAccess(),renderEvents()]).catch(()=>{});}
 if(changes.activity||changes.pending)renderEvents().catch(()=>{});
});
chrome.tabs.onActivated.addListener(()=>getCurrent().catch(()=>{}));
chrome.tabs.onUpdated.addListener((_id,change)=>{if(change.url)getCurrent().catch(()=>{});});
setup().catch(e=>notice(e.message,true));
