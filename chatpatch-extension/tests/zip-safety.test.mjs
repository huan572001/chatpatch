import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {chatIdFromUrl,normalizedPath,inspectZipHeaders,mapArchivePaths,isBlockedPath} from '../zip-safety.mjs';
const require=createRequire(import.meta.url);
const JSZip=require('../lib/jszip.min.js');
async function makeZip(map){const z=new JSZip();for(const [path,content] of Object.entries(map))z.file(path,content);const arr=await z.generateAsync({type:'uint8array',compression:'DEFLATE'});return arr.buffer.slice(arr.byteOffset,arr.byteOffset+arr.byteLength);}

test('nhận diện chat trong Project và chat trực tiếp',()=>{
 assert.equal(chatIdFromUrl('https://chatgpt.com/c/67fa89c1-1234-abcd-9876-aabbccddeeff'),'67fa89c1-1234- abcd-9876-aabbccddeeff'.replace(' ',''));
 assert.equal(chatIdFromUrl('https://chatgpt.com/g/g-p-project/c/12345678-aaaa-bbbb-cccc-444444444444'),'12345678-aaaa-bbbb-cccc-444444444444');
 assert.equal(chatIdFromUrl('https://chatgpt.com/g/g-p-project'),null);
 assert.equal(chatIdFromUrl('https://malicious.example/c/12345678-aaaa-bbbb'),null);
});
test('reject unsafe zip names and absolute paths',()=>{
 for(const p of ['../evil.js','src/../evil.js','/private/a','.','C:/temp/a','foo\\evil','a//b','a/./b'])assert.throws(()=>normalizedPath(p));
 assert.equal(normalizedPath('src/App.tsx'),'src/App.tsx');
});
test('blocked secrets and node_modules',()=>{
 for(const p of ['.env','backend/.env.production','node_modules/x','src/.git/config','keys/api.pem','.lantern-backups/a'])assert.equal(isBlockedPath(p),true);
 assert.equal(isBlockedPath('src/components/index.ts'),false);
});
test('inspect normal JSZip archive',async()=>{
 const buf=await makeZip({'package.json':'{}','src/main.ts':'hello'});
 const entries=inspectZipHeaders(buf);
 assert.equal(entries.length,2);
 assert.ok(entries.some(e=>e.name==='src/main.ts'));
});
test('detect corrupted zip metadata',()=>{
 assert.throws(()=>inspectZipHeaders(new Uint8Array([1,2,3,4]).buffer));
});
test('reject zip larger than cap',()=>assert.throws(()=>inspectZipHeaders(new ArrayBuffer(30*1024*1024+1))));
test('auto flattens packaging wrapper even when it differs from destination folder name',()=>{
 const e=[{name:'wikex-register-login-layout/src/app.js',size:1},{name:'wikex-register-login-layout/package.json',size:1}];
 const result=mapArchivePaths(e,'wikex','auto',['src','package.json']);
 assert.equal(result.stripped,true);
 assert.equal(result.wrapper,'wikex-register-login-layout');
 assert.deepEqual(result.files.map(x=>x.path),['src/app.js','package.json']);
});
test('auto flattens project wrapper already accidentally created by an older sync',()=>{
 const e=[{name:'wikex-register-login-layout/src/Login.tsx',size:1},{name:'wikex-register-login-layout/package.json',size:1}];
 const r=mapArchivePaths(e,'wikex','auto',['src','package.json','wikex-register-login-layout']);
 assert.deepEqual(r.files.map(x=>x.path),['src/Login.tsx','package.json']);
 assert.equal(r.stripped,true);
});
test('auto keeps a real source subdirectory and existing destination folder',()=>{
 const src=[{name:'src/App.tsx',size:1},{name:'src/components/Button.tsx',size:1}];
 assert.deepEqual(mapArchivePaths(src,'wikex','auto',['src']).files.map(x=>x.path), ['src/App.tsx','src/components/Button.tsx']);
 const existing=[{name:'themes/dark.css',size:1}];
 assert.deepEqual(mapArchivePaths(existing,'wikex','auto',['themes']).files.map(x=>x.path), ['themes/dark.css']);
});
test('mode always, never and legacy boolean remain supported',()=>{
 const e=[{name:'project-new/src/a.js',size:1}];
 assert.deepEqual(mapArchivePaths(e,'wikex','never').files.map(x=>x.path), ['project-new/src/a.js']);
 assert.deepEqual(mapArchivePaths(e,'wikex',true).files.map(x=>x.path), ['src/a.js']);
 assert.deepEqual(mapArchivePaths(e,'wikex',false).files.map(x=>x.path), ['src/a.js']);
 assert.deepEqual(mapArchivePaths([{name:'src/a.js',size:1}],'wikex','always').files.map(x=>x.path), ['a.js']);
});
test('multiple ZIP root entries remain intact, metadata does not prevent wrapper detection',()=>{
 const e=[{name:'src/a.js',size:1},{name:'README.md',size:1}];
 assert.deepEqual(mapArchivePaths(e,'wikex','auto').files.map(x=>x.path), ['src/a.js','README.md']);
 const wrapped=[{name:'wikex-src/package.json',size:1},{name:'wikex-src/src/a.js',size:1},{name:'__MACOSX/._src',size:1},{name:'.DS_Store',size:1}];
 const m=mapArchivePaths(wrapped,'wikex','auto');
 assert.equal(m.stripped,true);
 assert.deepEqual(m.files.map(x=>x.path), ['package.json','src/a.js']);
 assert.equal(m.skipped,2);
});
test('skip sensitive entries without touching other files',()=>{
 const e=[{name:'src/a.ts',size:2},{name:'.env',size:5},{name:'node_modules/a.js',size:5}];
 const r=mapArchivePaths(e,'myapp');
 assert.equal(r.files.length,1);assert.equal(r.skipped,2);
});
test('reject malicious traversal from central directory',async()=>{
 // Same byte length for ../../a and qqqqqq? patch filename in central directory only.
 const buf=await makeZip({'x/aaaa.js':'1'});const raw=new Uint8Array(buf);
 const from=new TextEncoder().encode('x/aaaa.js'),to=new TextEncoder().encode('../aaa.js');
 let found=0;
 for(let i=0;i<raw.length-from.length;i++){
   if(from.every((b,k)=>raw[i+k]===b)){
     if(i>=46 && new DataView(buf).getUint32(i-46,true)===0x02014b50){raw.set(to,i);found++;break;}
   }
 }
 assert.equal(found,1);assert.throws(()=>inspectZipHeaders(buf),/đường dẫn/i);
});
test('reject a Linux symbolic link from ZIP external attrs',async()=>{
 const buf=await makeZip({'link.txt':'something'});const raw=new DataView(buf);
 for(let i=0;i<buf.byteLength-46;i++){
  if(raw.getUint32(i,true)===0x02014b50){raw.setUint8(i+5,3);raw.setUint32(i+38,0xa1ff0000,true);break;}
 }
 assert.throws(()=>inspectZipHeaders(buf),/symbolic link/);
});

test('accepts a large but normal source ZIP with >800 directory + file entries',async()=>{
 const zip=new JSZip();
 for(let i=0;i<900;i++)zip.file(`repo/src/module-${String(i).padStart(4,'0')}/index.ts`, `export const version=${i};\n`);
 const data=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
 const buf=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
 const entries=inspectZipHeaders(buf);
 assert.equal(entries.length,900);
 assert.equal(mapArchivePaths(entries,'repo').files.length,900);
});

test('accepts ZIP from Python zipfile with Unicode names and ZIP comment', async()=>{
 const {readFileSync}=await import('node:fs');
 const data=readFileSync(new URL('./fixtures/chatgpt-python-sample.zip',import.meta.url));
 const buf=data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);
 const entries=inspectZipHeaders(buf);
 assert.equal(entries.length,2);
 assert.ok(entries.some(e=>e.name.endsWith('Đăng nhập.tsx')));
 const contents=await JSZip.loadAsync(buf,{checkCRC32:true});
 assert.ok(contents.file('wikex-register-login-layout/src/Đăng nhập.tsx'));
});

test('explains Central Directory offset corruption precisely instead of generic metadata error', async()=>{
 const buf=await makeZip({'README.md':'test'});
 const view=new DataView(buf);
 let end=buf.byteLength-22;
 while(view.getUint32(end,true)!==0x06054b50)end--;
 view.setUint32(end+16,0xfffffff0,true);
 assert.throws(()=>inspectZipHeaders(buf), /Central Directory không hợp lệ/);
});

test('clear error when Central Directory points outside archive', async()=>{
 const buf=await makeZip({'README.md':'test'});
 const view=new DataView(buf);
 let end=buf.byteLength-22;
 while(view.getUint32(end,true)!==0x06054b50)end--;
 view.setUint32(end+12,0x10000000,true);
 assert.throws(()=>inspectZipHeaders(buf), /Central Directory.*vượt dữ liệu có sẵn/);
});

test('reject unsupported encrypted ZIP before writing anything', async()=>{
 const buf=await makeZip({'README.md':'test'});
 const view=new DataView(buf);
 for(let i=0;i<buf.byteLength-46;i++)if(view.getUint32(i,true)===0x02014b50){view.setUint16(i+8,1,true);break;}
 assert.throws(()=>inspectZipHeaders(buf),/mã hóa/);
});


test('supports common ZIP with harmless leading bytes when central-directory offset is relative to ZIP payload',async()=>{
 const original=new Uint8Array(await makeZip({'README.md':'Version 2'}));
 const prefix=new TextEncoder().encode('ZIP prefix payload\n');
 const combined=new Uint8Array(prefix.length+original.length);
 combined.set(prefix);combined.set(original,prefix.length);
 const entries=inspectZipHeaders(combined.buffer);
 assert.equal(entries.length,1);
 assert.equal(entries[0].name,'README.md');
});

test('reports clear limit when an archive has too many Central Directory entries',async()=>{
 const buf=await makeZip({'README.md':'test'});
 const view=new DataView(buf);
 let end=buf.byteLength-22;while(view.getUint32(end,true)!==0x06054b50)end--;
 view.setUint16(end+8,6001,true);view.setUint16(end+10,6001,true);
 assert.throws(()=>inspectZipHeaders(buf),/6001 mục.*6000/);
});
