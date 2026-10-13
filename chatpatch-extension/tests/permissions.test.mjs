import test from 'node:test';
import assert from 'node:assert/strict';
import {readPermissionState, permissionLabel, firstRestorable, summarizePermissions} from '../permissions.mjs';

test('does not treat a stored handle as a granted permission', async()=>{
 const handle={name:'ChatPatch-Sync',async queryPermission({mode}){assert.equal(mode,'read');return 'prompt';}};
 assert.equal(await readPermissionState(handle,'read'),'prompt');
 assert.equal(permissionLabel('prompt'),'Cần xác nhận lại');
});
test('handles a restored write grant', async()=>{
 const handle={async queryPermission({mode}){assert.equal(mode,'readwrite');return 'granted';}};
 assert.equal(await readPermissionState(handle,'readwrite'),'granted');
});
test('handles denied, unavailable, and failing handles', async()=>{
 assert.equal(await readPermissionState(null),'missing');
 assert.equal(await readPermissionState({async queryPermission(){return 'denied'}}),'denied');
 assert.equal(await readPermissionState({async queryPermission(){throw Error('missing')}}),'error');
});
test('selects exactly one handle to reauthorize and never an absent one',()=>{
 const source={name:'Project A'};
 const items=[{key:'inbox',state:'granted',handle:{}},{key:'project:x',state:'missing',handle:null},{key:'project:y',state:'prompt',handle:source},{key:'project:z',state:'denied',handle:{}}];
 assert.deepEqual(firstRestorable(items),items[2]);
 assert.deepEqual(summarizePermissions(items),{granted:1,total:4,remaining:3,missing:1});
});
test('fully authorized mappings do not request another prompt',()=>{
 assert.equal(firstRestorable([{state:'granted',handle:{}},{state:'granted',handle:{}}]),null);
});
