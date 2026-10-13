import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {messages} from '../i18n.mjs';
const read = p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('all visible names use ChatPatch branding',()=>{
 for(const locale of ['vi','en'])for(const [key,text] of Object.entries(messages[locale])){
  assert.doesNotMatch(text,/Lantern(?:[- ]Sync)?|\.lantern-backups/i,`${locale}:${key}`);
 }
 assert.doesNotMatch(read('../sidepanel.html'),/Lantern/i);
 assert.doesNotMatch(read('../README.md'),/Lantern(?:[- ]Sync)?/i);
});
test('routes and backups use new directories, with migration aliases isolated',()=>{
 assert.doesNotMatch(read('../background.js'), /const INBOX =/);
 assert.match(read('../background.js'),/absoluteFileUrl/);
 assert.match(read('../offscreen.js'),/\.chatpatch-backups/);
 assert.match(read('../zip-safety.mjs'),/\.lantern-backups/); // historic backups are protected
 assert.match(read('../db.mjs'),/chatpatch-folder-handles-v1/);
 assert.match(read('../db.mjs'),/LEGACY_DB_NAME/);
 assert.doesNotMatch(read('../sidepanel.js'),/inboxConfigured/);
});
