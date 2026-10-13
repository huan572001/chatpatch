import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {messages, normalizeLanguage, translate, translateActivity} from '../i18n.mjs';

const html = readFileSync(new URL('../sidepanel.html',import.meta.url),'utf8');
const js = readFileSync(new URL('../sidepanel.js',import.meta.url),'utf8');

test('Vietnamese and English include exactly the same translation keys',()=>{
 const a=Object.keys(messages.vi).sort();const b=Object.keys(messages.en).sort();
 assert.deepEqual(a,b);
});
test('Every HTML i18n key exists in both locales',()=>{
 const keys=[...html.matchAll(/data-i18n(?:-title)?="([^"]+)"/g)].map(m=>m[1]);
 assert.ok(keys.length>20);
 for(const key of keys){assert.ok(messages.vi[key],`Missing VN: ${key}`);assert.ok(messages.en[key],`Missing EN: ${key}`)}
});
test('Every explicit JS translation key exists in both locales',()=>{
 const keys=[...js.matchAll(/(?<![\w.])t\('([^']+)'/g)].map(m=>m[1]);
 for(const key of keys.filter(key=>!key.endsWith('.'))){assert.ok(messages.vi[key],`Missing VN: ${key}`);assert.ok(messages.en[key],`Missing EN: ${key}`)}
});
test('Dropdown is accessible and saves language setting',()=>{
 assert.match(html,/<label for="lang-select"/);
 assert.match(html,/<select id="lang-select"/);
 assert.match(js,/chrome\.storage\.local\.set\(\{uiLanguage:language\}\)/);
 assert.match(js,/normalizeLanguage\(data\.uiLanguage\)/);
});
test('Fallback and interpolated messages work',()=>{
 assert.equal(normalizeLanguage('ja'),'vi');
 assert.equal(translate('en','links.lastSynced',{count:4}),'Synced 4 files');
 assert.equal(translate('vi','links.lastSynced',{count:4}),'Đã đồng bộ 4 file');
});
test('Legacy activity logs are translated in English without touching source',()=>{
 const old='Đã thấy ZIP nhưng KHÔNG đồng bộ: wikex.zip — Chat đang mở chưa được liên kết hoặc đã tắt tự đồng bộ';
 assert.match(translateActivity('en',old),/not linked or auto-sync is disabled/);
 assert.equal(translateActivity('vi',old),old);
});
test('Localization does not alter extension critical service paths or permissions',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../manifest.json',import.meta.url),'utf8'));
 assert.equal(manifest.version,'1.0.0');
 assert.deepEqual(manifest.permissions,['storage','tabs','downloads','sidePanel','offscreen']);
 assert.equal(manifest.background.service_worker,'background.js');
});
