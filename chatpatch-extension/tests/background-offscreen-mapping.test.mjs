import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const chatId='6acdb771-7a20-83ec-b03a-146e7faf0823';
const script=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8');
function makeApp(){
  const listeners={};const outbound=[];
  const local={mappings:{[chatId]:{auto:true,folderName:'wikex',stripRoot:true,rootMode:"never"}},
    pending:{7:{chatId,filename:'wikex.zip'}},assignments:{7:{chatId,filename:'wikex.zip'}}};
  const chrome={
    runtime:{
      onInstalled:{addListener(fn){listeners.installed=fn;}},onStartup:{addListener(fn){listeners.startup=fn;}},
      onMessage:{addListener(fn){listeners.message=fn;}},
      getURL:f=>'chrome-extension://abc/'+f,getContexts:async()=>[],
      sendMessage:async msg=>{
        outbound.push(msg);
        if(msg.target==='OFFSCREEN')return {ok:true,result:{updated:1,unchanged:0}};
        throw new Error('unexpected message');
      }
    },
    storage:{local:{
      get:async key=>typeof key==='string'?{[key]:local[key]}:Object.fromEntries(key.map(k=>[k,local[k]])),
      set:async obj=>Object.assign(local,obj)
    },session:{get:async()=>({intents:[]}),set:async()=>{}}},
    downloads:{onDeterminingFilename:{addListener(fn){listeners.download=fn;}},onChanged:{addListener(fn){listeners.changed=fn;}},search:async()=>[{id:7,state:'complete',filename:'/Users/test/Downloads/wikex.zip'}]},
    extension:{isAllowedFileSchemeAccess:async()=>true},
    sidePanel:{setPanelBehavior:async()=>{}},offscreen:{createDocument:async()=>{}},tabs:{query:async()=>[]}
  };
  vm.runInNewContext(script,{chrome,Date,URL,console,Promise,setTimeout},{filename:'background.js'});
  const message=msg=>new Promise(resolve=>listeners.message(msg,null,resolve));
  return {outbound,local,message};
}
test('Retry ZIP passes latest chat mapping to Offscreen and clears pending after success',async()=>{
  const app=makeApp();
  const res=await app.message({kind:'RETRY_SYNC',id:7});
  assert.equal(res.ok,true);
  assert.equal(app.outbound.length,1);
  assert.equal(app.outbound[0].target,'OFFSCREEN');
  assert.equal(app.outbound[0].mapping.folderName,'wikex');
  assert.equal(app.outbound[0].mapping.stripRoot,true);
  assert.equal(app.outbound[0].mapping.rootMode,'never');
  assert.equal(app.outbound[0].fileUrl,'file:///Users/test/Downloads/wikex.zip');
  assert.equal(app.local.pending[7],undefined);
});
test('Manual ZIP passes chat mapping to Offscreen too',async()=>{
  const app=makeApp();
  const res=await app.message({kind:'MANUAL_SYNC',chatId});
  assert.equal(res.ok,true);
  assert.equal(app.outbound[0].manual,true);
  assert.equal(app.outbound[0].mapping.folderName,'wikex');
  assert.equal(app.outbound[0].mapping.rootMode,'never');
});
