/** ChatPatch handle store. Upgrade from v2.2.1 in-place without clearing existing folder links. */
const DB_NAME = 'chatpatch-folder-handles-v1';
// Compatibility-only identifier for users who installed this extension before the rebrand.
const LEGACY_DB_NAME = 'lantern-zip-sync-handles-v2';
const STORE = 'handles';
function open(name=DB_NAME) {
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(name,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE);};
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
 });
}
async function op(name,key,action,value) {
 const db=await open(name);
 try {return await new Promise((resolve,reject)=>{
  const tx=db.transaction(STORE,action==='get'?'readonly':'readwrite');
  const r=action==='get'?tx.objectStore(STORE).get(key):action==='put'?tx.objectStore(STORE).put(value,key):tx.objectStore(STORE).delete(key);
  r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);
 });} finally {db.close();}
}
async function legacyExists() {
 if(typeof indexedDB.databases !== 'function')return true;
 try{return (await indexedDB.databases()).some(item=>item.name===LEGACY_DB_NAME);}catch{return true;}
}
export async function getHandle(key) {
 const existing=await op(DB_NAME,key,'get');
 if(existing)return existing;
 if(!await legacyExists())return undefined;
 const legacy=await op(LEGACY_DB_NAME,key,'get');
 if(legacy)await op(DB_NAME,key,'put',legacy);
 return legacy;
}
export const putHandle=(key,handle)=>op(DB_NAME,key,'put',handle);
export const delHandle=async key=>{
 // Delete in both databases so an unlinked chat cannot be resurrected by migration.
 await op(DB_NAME,key,'delete');
 if(await legacyExists())await op(LEGACY_DB_NAME,key,'delete');
};
