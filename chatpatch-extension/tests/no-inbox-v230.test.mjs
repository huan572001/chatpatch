import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('../manifest.json',import.meta.url),'utf8'));
function makeBackground({allowed=true,filename='/Users/Huan/Downloads/wikex update.zip'}={}) {
 const listeners={};let sends=[];
 const chatId='6acdb771-7a20-83ec-b03a-146e7faf0823';
 const local={pending:{17:{chatId,filename:'wikex update.zip'}},assignments:{17:{chatId,filename:'wikex update.zip'}},mappings:{[chatId]:{auto:true,folderName:'Wikex'}}};
 const chrome={
  runtime:{onInstalled:{addListener(){}},onStartup:{addListener(){}},onMessage:{addListener(fn){listeners.message=fn;}},getURL:f=>'chrome-extension://id/'+f,getContexts:async()=>[],sendMessage:async p=>{sends.push(p);return {ok:true,result:{updated:1,unchanged:0}}}},
  extension:{isAllowedFileSchemeAccess:async()=>allowed},
  sidePanel:{setPanelBehavior:async()=>{}},
  storage:{local:{get:async k=>typeof k==='string'?{[k]:local[k]}:Object.fromEntries(k.map(i=>[i,local[i]])),set:async obj=>Object.assign(local,obj)},session:{get:async()=>({intents:[]}),set:async()=>{}}},
  downloads:{onDeterminingFilename:{addListener(fn){listeners.filename=fn;}},onChanged:{addListener(fn){listeners.changed=fn;}},search:async()=>[{id:17,state:'complete',filename}]},
  offscreen:{createDocument:async()=>{}},tabs:{query:async()=>[]}
 };
 vm.runInNewContext(source,{chrome,Date,URL,console,Promise,setTimeout},{filename:'background.js'});
 const message=msg=>new Promise(resolve=>listeners.message(msg,null,resolve));
 return {local,sends,message,chatId};
}
test('manifest asks file URL permission and no longer requires an inbox',()=>{
 assert.equal(manifest.version,'1.0.0');
 assert.ok(manifest.host_permissions.includes('file:///*'));
 const html=fs.readFileSync(new URL('../sidepanel.html',import.meta.url),'utf8');
 assert.doesNotMatch(html,/id="setup-inbox"|id="inbox-badge"/);
 assert.match(html,/id="file-permission"/);
});
test('converts macOS download path into encoded file:/// URL',async()=>{
 const b=makeBackground({filename:'/Users/Huan/Downloads/Wikex source #2.zip'});
 const result=await b.message({kind:'RETRY_SYNC',id:17});
 assert.equal(result.ok,true);
 assert.equal(b.sends[0].fileUrl,'file:///Users/Huan/Downloads/Wikex%20source%20%232.zip');
 assert.equal(b.sends[0].mapping.folderName,'Wikex');
 assert.equal(b.local.pending[17],undefined);
});
test('converts Windows download path into encoded file:/// URL',async()=>{
 const b=makeBackground({filename:'C:\\Users\\Public\\Downloads\\Wikex code.zip'});
 const result=await b.message({kind:'RETRY_SYNC',id:17});
 assert.equal(result.ok,true);
 assert.equal(b.sends[0].fileUrl,'file:///C:/Users/Public/Downloads/Wikex%20code.zip');
});
test('does not read ZIP if user has not enabled local file URL permission',async()=>{
 const b=makeBackground({allowed:false});
 const result=await b.message({kind:'RETRY_SYNC',id:17});
 assert.equal(result.ok,true); // retry is submitted, sync failure is reflected in activity/pending
 assert.equal(b.sends.length,0);
 assert.ok(b.local.pending[17]);
 assert.match(b.local.activity[0].text,/Allow access to file URLs/);
});
