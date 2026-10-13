import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const script=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8');
const id='67fa89c1-1234-abcd-9876-aabbccddeeff';
function runner(intents,referrer='https://chatgpt.com/c/'+id,filename='/tmp/result.zip',activeTab=null) {
 const registered={};
 const local={mappings:{[id]:{auto:true,folderName:'demo'}},assignments:{},inboxConfigured:true,inboxFolderName:'ChatPatch-Sync'};
 const session={intents};
 const chrome={
  runtime:{onInstalled:{addListener(fn){registered.installed=fn;}},onStartup:{addListener(fn){registered.startup=fn;}},onMessage:{addListener(fn){registered.message=fn;}},getURL(v){return 'chrome-extension://abc/'+v},getContexts:async()=>[]},
  sidePanel:{setPanelBehavior:async()=>{}},
  storage:{local:{get:async(k)=>typeof k==='string'?{[k]:local[k]}:Object.fromEntries(k.map(i=>[i,local[i]])),set:async(o)=>Object.assign(local,o)},session:{get:async(k)=>({[k]:session[k]}),set:async(o)=>Object.assign(session,o)}},
  downloads:{onDeterminingFilename:{addListener(fn){registered.filename=fn;}},onChanged:{addListener(fn){registered.changed=fn;}},download:async()=>1,search:async()=>[]},
  offscreen:{createDocument:async()=>{}},
  tabs:{query:async()=>activeTab?[activeTab]:[]}
 };
 const timers={setTimeout};
 vm.runInNewContext(script,{chrome,Date,URL,console,Promise,...timers},{filename:'background.js'});
 return {chrome,local,registered,filename,referrer};
}
async function filenameEvent(x){
 const item={id:111,filename:x.filename,mime:'application/zip',url:'https://files.oaiusercontent.com/result.zip',referrer:x.referrer};
 return new Promise(resolve=>{x.registered.filename(item,(res)=>resolve(res));});
}

test('associates ChatGPT ZIP with chat without changing the download path',async()=>{
 const x=runner([{chatId:id,at:Date.now(),tabId:7,href:'https://chatgpt.com/backend-api/result.zip'}]);
 const res=await filenameEvent(x);
 assert.equal(res,undefined); // Chrome retains its own download destination
 assert.equal(x.local.assignments[111].chatId,id);
});
test('does not route a ZIP when neither click nor mapped active chat exists',async()=>{
 const x=runner([]);
 const res=await filenameEvent(x);
 assert.equal(res,undefined);assert.deepEqual(x.local.assignments,{});
});
test('does not route ZIP from another chat ID',async()=>{
 const x=runner([{chatId:id,at:Date.now(),tabId:7}], 'https://chatgpt.com/c/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
 const res=await filenameEvent(x);
 assert.equal(res,undefined);
});
test('does not route ZIP from a third party website',async()=>{
 const x=runner([{chatId:id,at:Date.now(),tabId:7}], 'https://github.com/owner/repo/releases');
 const res=await filenameEvent(x);
 assert.equal(res,undefined);
});
test('does not guess between two chat clicks',async()=>{
 const x=runner([{chatId:id,at:Date.now(),tabId:7},{chatId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',at:Date.now(),tabId:8}]);
 const res=await filenameEvent(x);
 assert.equal(res,undefined);
});

test('routes ZIP from active linked chat even when DOM click was missed',async()=>{
 const x=runner([],'https://chatgpt.com/c/'+id,'/tmp/result.zip',{id:55,url:'https://chatgpt.com/g/g-abcd/c/'+id});
 const res=await filenameEvent(x);
 assert.equal(res,undefined);
 assert.equal(x.local.assignments[111].chatId,id);
 assert.match(x.local.activity[0].text,/active-tab/);
});
test('does not auto-import when active tab is a different chat',async()=>{
 const x=runner([],'https://chatgpt.com/c/'+id,'/tmp/result.zip',{id:55,url:'https://chatgpt.com/c/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'});
 const res=await filenameEvent(x);
 assert.equal(res,undefined);
 assert.match(x.local.activity[0].text,/KHÔNG đồng bộ/);
});
test('detects blob download URL from ChatGPT with active linked tab',async()=>{
 const x=runner([],'','/tmp/result.zip',{id:55,url:'https://chatgpt.com/c/'+id});
 const item={id:111,filename:x.filename,mime:'application/zip',url:'blob:https://chatgpt.com/12ab-34ef',referrer:''};
 const res=await new Promise(resolve=>x.registered.filename(item,resolve));
 assert.equal(res,undefined);
});
test('records ignored ZIP in activity log rather than remaining silent',async()=>{
 const x=runner([]);
 await filenameEvent(x);
 assert.match(x.local.activity[0].text,/KHÔNG đồng bộ/);
});


test('recognizes download even when old inbox settings are missing',async()=>{
 const x=runner([{chatId:id,at:Date.now(),tabId:7}]);
 x.local.inboxConfigured=false;
 x.local.inboxFolderName=null;
 const r=await filenameEvent(x);
 assert.equal(r,undefined);
 assert.equal(x.local.assignments[111].chatId,id);
});
