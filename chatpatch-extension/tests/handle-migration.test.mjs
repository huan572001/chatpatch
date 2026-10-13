import test from 'node:test';
import assert from 'node:assert/strict';

// Minimal asynchronous IndexedDB emulator for testing upgrade behavior with
// existing user handles. No external test dependencies are required.
function fakeIndexedDB() {
  const dbs = new Map();
  const scheduled = f => queueMicrotask(f);
  const dbFor = name => ({
    objectStoreNames:{contains:s=>dbs.get(name).has(s)},
    createObjectStore:s=>{dbs.get(name).set(s,new Map());},
    transaction:s=>({objectStore:()=>({
      get:key=>request(()=>dbs.get(name).get(s).get(key)),
      put:(value,key)=>request(()=>{dbs.get(name).get(s).set(key,value);return key;}),
      delete:key=>request(()=>{dbs.get(name).get(s).delete(key);return undefined;})
    })}),
    close:()=>{}
  });
  function request(fn) {
    const req={};scheduled(()=>{try{req.result=fn();req.onsuccess?.();}catch(e){req.error=e;req.onerror?.();}});return req;
  }
  return {
    dbs,
    databases:async()=>[...dbs.keys()].map(name=>({name})),
    open(name){const req={};scheduled(()=>{
      let upgraded=false;if(!dbs.has(name)){dbs.set(name,new Map());upgraded=true;}
      req.result=dbFor(name);
      if(upgraded)req.onupgradeneeded?.();
      req.onsuccess?.();
    });return req;}
  };
}
const mock=fakeIndexedDB();
globalThis.indexedDB=mock;
const {getHandle,putHandle,delHandle}=await import('../db.mjs');
test('existing chat folder handle migrates into ChatPatch storage without losing identity',async()=>{
  const legacy='lantern-zip-sync-handles-v2';
  mock.dbs.set(legacy,new Map([['handles',new Map([['project:chatA',{name:'Wikex',kind:'directory'}]])]]));
  const h=await getHandle('project:chatA');
  assert.equal(h.name,'Wikex');
  assert.equal(mock.dbs.get('chatpatch-folder-handles-v1').get('handles').get('project:chatA'),h);
});
test('new ChatPatch handle overrides legacy and unlink removes both copies',async()=>{
  const newHandle={name:'Wikex-Updated',kind:'directory'};
  await putHandle('project:chatA',newHandle);
  assert.equal(await getHandle('project:chatA'),newHandle);
  await delHandle('project:chatA');
  assert.equal(await getHandle('project:chatA'),undefined);
  assert.equal(mock.dbs.get('lantern-zip-sync-handles-v2').get('handles').has('project:chatA'),false);
});
test('unknown folder key is not manufactured in either database',async()=>{
  assert.equal(await getHandle('project:missing'),undefined);
});
