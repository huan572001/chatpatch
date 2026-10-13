import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { inspectZipHeaders, mapArchivePaths, isBlockedPath, MAX_ZIP_BYTES, MAX_TOTAL_BYTES } from '../zip-safety.mjs';
const require=createRequire(import.meta.url);
const JSZip=require('../lib/jszip.min.js');
const script=fs.readFileSync(new URL('../background.js',import.meta.url),'utf8');
const id='6acdb771-7a20-83ec-b03a-146e7faf0823';
function mockBackground(local) {
 const registered={};const session={intents:[{chatId:id,tabId:77,at:Date.now()}]};
 const chrome={
  runtime:{onInstalled:{addListener(){}},onStartup:{addListener(){}},onMessage:{addListener(fn){registered.message=fn;}},getURL:s=>'chrome-extension://abc/'+s,getContexts:async()=>[]},
  sidePanel:{setPanelBehavior:async()=>{}},
  storage:{local:{get:async keys=>typeof keys==='string'?{[keys]:local[keys]}:Object.fromEntries(keys.map(k=>[k,local[k]])),set:async value=>Object.assign(local,value)},session:{get:async key=>({[key]:session[key]}),set:async value=>Object.assign(session,value)}},
  tabs:{query:async()=>[]},
  downloads:{onDeterminingFilename:{addListener(fn){registered.route=fn;}},onChanged:{addListener(fn){registered.changed=fn;}},search:async()=>[]},
  offscreen:{createDocument:async()=>{}}
 };
 vm.runInNewContext(script,{chrome,Date,URL,console,Promise,setTimeout});
 return {chrome,registered};
}
const item={id:111,filename:'/Downloads/result.zip',mime:'application/zip',url:'https://files.oaiusercontent.com/test.zip',referrer:'https://chatgpt.com/c/'+id};
async function route(reg){return new Promise(resolve=>reg.route(item,resolve));}
test('existing chat association remains when old inbox settings are missing',async()=>{
 const local={mappings:{[id]:{auto:true,folderName:'Wikex'}},assignments:{},inboxConfigured:false};
 const {registered}=mockBackground(local);
 assert.equal(await route(registered),undefined);
 assert.equal(local.assignments[111].chatId,id);
 assert.equal(local.assignments[111].inboxName,undefined);
});
test('old inbox identity does not affect new download association',async()=>{
 const local={mappings:{[id]:{auto:true,folderName:'Wikex'}},assignments:{},inboxFolderName:'Lantern-Sync'};
 const {registered}=mockBackground(local);
 assert.equal(await route(registered),undefined);
 assert.equal(local.assignments[111].chatId,id);
});
test('extension does not force a download directory or rename',async()=>{
 const local={mappings:{[id]:{auto:true,folderName:'Wikex'}},assignments:{}};
 const {registered}=mockBackground(local);
 assert.equal(await route(registered),undefined);
 assert.equal(local.assignments[111].filename,'result.zip');
});
test('legacy Boolean value is ignored; download still associated with current chat',async()=>{
 const local={mappings:{[id]:{auto:true,folderName:'Wikex'}},assignments:{},inboxConfigured:true};
 const {registered}=mockBackground(local);
 assert.equal(await route(registered),undefined);
 assert.equal(local.assignments[111].chatId,id);
});
