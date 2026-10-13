import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { inspectZipHeaders, mapArchivePaths, isBlockedPath, MAX_ZIP_BYTES, MAX_TOTAL_BYTES } from '../zip-safety.mjs';
const require=createRequire(import.meta.url);
const JSZip=require('../lib/jszip.min.js');
const chatId='6acdb771-7a20-83ec-b03a-146e7faf0823';

class MockFile {
  constructor(name,contents=new Uint8Array()) {this.name=name;this.bytes=Uint8Array.from(contents);}
  async getFile() {return {name:this.name,size:this.bytes.length,arrayBuffer:async()=>Uint8Array.from(this.bytes).buffer};}
  async createWritable() {
    let staged;
    return {
      write:async bytes=>{staged=Uint8Array.from(bytes);},
      close:async()=>{this.bytes=staged;},
      abort:async()=>{}
    };
  }
}
class MockDirectory {
  constructor(name) {this.name=name;this.files=new Map();this.dirs=new Map();}
  async queryPermission(){return 'granted';}
  async *keys(){yield* this.files.keys();yield* this.dirs.keys();}
  async getDirectoryHandle(name,{create=false}={}) {
    if(this.dirs.has(name))return this.dirs.get(name);
    if(!create)throw Object.assign(new Error('Not found'),{name:'NotFoundError'});
    const dir=new MockDirectory(name);this.dirs.set(name,dir);return dir;
  }
  async getFileHandle(name,{create=false}={}) {
    if(this.files.has(name))return this.files.get(name);
    if(!create)throw Object.assign(new Error('Not found'),{name:'NotFoundError'});
    const file=new MockFile(name);this.files.set(name,file);return file;
  }
}
async function buildZip(content='Version 2') {
  const zip=new JSZip();zip.file('README.md',content);
  return new Uint8Array(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}));
}
function boot({project,inbox}) {
  const code=fs.readFileSync(new URL('../offscreen.js',import.meta.url),'utf8').replace(/^import .*;\s*$/gm,'');
  let handler;
  // Chrome Offscreen documents DO NOT expose chrome.storage. Deliberately omit it.
  const chrome={runtime:{onMessage:{addListener(fn){handler=fn;}}}};
  const fetch=async url=>{
    const filename=decodeURIComponent(String(url).split('/').pop());
    const file=inbox?.files.get(filename);
    if(!file)throw new Error('NotFoundError: missing file');
    return {ok:true,arrayBuffer:async()=>(await file.getFile()).arrayBuffer()};
  };
  const context={getHandle:async key=>({['project:'+chatId]:project,inbox})[key],fetch,MAX_ZIP_BYTES,MAX_TOTAL_BYTES,inspectZipHeaders,mapArchivePaths,isBlockedPath,chrome,JSZip,Uint8Array,ArrayBuffer,Date,Error,console,setTimeout};
  vm.runInNewContext(code,context,{filename:'offscreen.js'});
  return (msg)=>new Promise(resolve=>{
    const handled=handler({target:'OFFSCREEN',kind:'PROCESS_ZIP',chatId,fileUrl:'file:///Users/test/Downloads/'+encodeURIComponent(msg.filename||'test.zip'),...msg},null,resolve);
    assert.equal(handled,true);
  });
}

test('Offscreen without chrome.storage applies ZIP, creates backup, and reports successful sync',async()=>{
  const project=new MockDirectory('wikex');
  project.files.set('README.md',new MockFile('README.md',new TextEncoder().encode('Version 1')));
  const inbox=new MockDirectory('ChatPatch-Sync');
  inbox.files.set('test.zip',new MockFile('test.zip',await buildZip()));
  const run=boot({project,inbox});
  const result=await run({filename:'test.zip',mapping:{auto:true,folderName:'wikex',stripRoot:false}});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.result.updated,1);
  assert.equal(new TextDecoder().decode(project.files.get('README.md').bytes),'Version 2');
  const backups=project.dirs.get('.chatpatch-backups');
  assert.equal(backups.dirs.size,1);
  const [backupDir]=backups.dirs.values();
  assert.equal(new TextDecoder().decode(backupDir.files.get('README.md').bytes),'Version 1');
});

test('Offscreen rejects missing or disabled mapping with explicit error, no writes',async()=>{
  const project=new MockDirectory('wikex');const inbox=new MockDirectory('ChatPatch-Sync');
  inbox.files.set('test.zip',new MockFile('test.zip',await buildZip()));
  const run=boot({project,inbox});
  const result=await run({filename:'test.zip'});
  assert.equal(result.ok,false);
  assert.match(result.error,/thiếu cấu hình thư mục/);
  assert.equal(project.files.size,0);
});

test('Offscreen imports ChatGPT-style Python ZIP without changing any unrelated file',async()=>{
  const project=new MockDirectory('wikex');
  project.files.set('UNRELATED.txt',new MockFile('UNRELATED.txt',new TextEncoder().encode('keep this')));
  const inbox=new MockDirectory('ChatPatch-Sync');
  const data=fs.readFileSync(new URL('./fixtures/chatgpt-python-sample.zip',import.meta.url));
  inbox.files.set('python.zip',new MockFile('python.zip',data));
  const run=boot({project,inbox});
  const result=await run({filename:'python.zip',mapping:{auto:true,folderName:'wikex',rootMode:'auto'}});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.result.updated,2);
  assert.ok(project.files.get('UNRELATED.txt'));
  assert.ok(project.dirs.get('src')?.files.get('Đăng nhập.tsx'));
});

test('Offscreen refuses corrupt archive before writing project files',async()=>{
  const project=new MockDirectory('wikex');
  const inbox=new MockDirectory('ChatPatch-Sync');
  inbox.files.set('invalid.zip',new MockFile('invalid.zip',new TextEncoder().encode('not really a zip')));
  const run=boot({project,inbox});
  const result=await run({filename:'invalid.zip',mapping:{auto:true,folderName:'wikex',stripRoot:false}});
  assert.equal(result.ok,false);
  assert.match(result.error,/ZIP/);
  assert.equal(project.files.size,0);
  assert.equal(project.dirs.size,0);
});

test('Offscreen merges wrapper children into destination root, replaces matching code and preserves unrelated files',async()=>{
  const project=new MockDirectory('wikex');
  const src=await project.getDirectoryHandle('src',{create:true});
  src.files.set('Login.tsx',new MockFile('Login.tsx',new TextEncoder().encode('old login')));
  project.files.set('KEEP.txt',new MockFile('KEEP.txt',new TextEncoder().encode('do not delete')));
  const inbox=new MockDirectory('ChatPatch-Sync');
  const zip=new JSZip();
  zip.file('wikex-register-login-layout/src/Login.tsx','new login');
  zip.file('wikex-register-login-layout/src/Register.tsx','new register');
  zip.file('wikex-register-login-layout/package.json','{"name":"wikex"}');
  inbox.files.set('project.zip',new MockFile('project.zip',new Uint8Array(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}))));
  const result=await boot({project,inbox})({filename:'project.zip',mapping:{auto:true,folderName:'wikex',rootMode:'auto'}});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.result.stripped,true);
  assert.equal(result.result.wrapper,'wikex-register-login-layout');
  assert.equal(result.result.updated,3);
  assert.equal(new TextDecoder().decode(src.files.get('Login.tsx').bytes),'new login');
  assert.equal(new TextDecoder().decode(src.files.get('Register.tsx').bytes),'new register');
  assert.equal(new TextDecoder().decode(project.files.get('KEEP.txt').bytes),'do not delete');
  assert.equal(project.dirs.has('wikex-register-login-layout'),false);
  const [backup]=project.dirs.get('.chatpatch-backups').dirs.values();
  assert.equal(new TextDecoder().decode(backup.dirs.get('src').files.get('Login.tsx').bytes),'old login');
});
test('Offscreen preserves real src subdirectory when source ZIP contains only src/',async()=>{
  const project=new MockDirectory('wikex');
  const inbox=new MockDirectory('ChatPatch-Sync');
  const zip=new JSZip();zip.file('src/Login.tsx','source file');
  inbox.files.set('src.zip',new MockFile('src.zip',new Uint8Array(await zip.generateAsync({type:'uint8array',compression:'DEFLATE'}))));
  const result=await boot({project,inbox})({filename:'src.zip',mapping:{auto:true,folderName:'wikex',rootMode:'auto'}});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.result.stripped,false);
  assert.ok(project.dirs.get('src').files.get('Login.tsx'));
  assert.equal(project.files.has('Login.tsx'),false);
});


test('missing downloaded ZIP gives actionable file-URL message and never changes source',async()=>{
  const project=new MockDirectory('wikex');
  project.files.set('README.md',new MockFile('README.md',new TextEncoder().encode('old')));
  const inbox=new MockDirectory('ChatPatch-Sync');
  const result=await boot({project,inbox})({filename:'missing.zip',mapping:{auto:true,folderName:'wikex'}});
  assert.equal(result.ok,false);
  assert.match(result.error,/Chrome không đọc được ZIP/);
  assert.match(result.error,/Chọn ZIP cập nhật/);
  assert.equal(new TextDecoder().decode(project.files.get('README.md').bytes),'old');
  assert.equal(project.dirs.size,0);
});

test('missing linked project folder gives re-link guidance before any changes',async()=>{
  const project=new MockDirectory('wikex');
  project.keys=async function*(){throw Object.assign(new Error('A requested file or directory could not be found at the time an operation was processed.'),{name:'NotFoundError'});};
  const inbox=new MockDirectory('ChatPatch-Sync');
  inbox.files.set('incoming.zip',new MockFile('incoming.zip',await buildZip()));
  const result=await boot({project,inbox})({filename:'incoming.zip',mapping:{auto:true,folderName:'wikex'}});
  assert.equal(result.ok,false);
  assert.match(result.error,/Thư mục dự án wikex/);
  assert.match(result.error,/Liên kết thư mục với chat này/);
  assert.equal(project.files.size,0);
  assert.equal(project.dirs.size,0);
});

test('file removed between scan and read identifies source file without writes',async()=>{
  const project=new MockDirectory('wikex');
  const gone=new MockFile('README.md',new TextEncoder().encode('old'));
  gone.getFile=async()=>{throw Object.assign(new Error('A requested file or directory could not be found at the time an operation was processed.'),{name:'NotFoundError'});};
  project.files.set('README.md',gone);
  const inbox=new MockDirectory('ChatPatch-Sync');
  inbox.files.set('incoming.zip',new MockFile('incoming.zip',await buildZip()));
  const result=await boot({project,inbox})({filename:'incoming.zip',mapping:{auto:true,folderName:'wikex'}});
  assert.equal(result.ok,false);
  assert.match(result.error,/File source README.md/);
  assert.equal(project.dirs.size,0);
});
