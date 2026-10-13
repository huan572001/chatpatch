import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {messages} from '../i18n.mjs';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const manifest = JSON.parse(read('../manifest.json'));
test('ChatPatch is the customer-facing extension brand', () => {
  assert.equal(manifest.name, 'ChatPatch');
  assert.equal(manifest.version, '1.0.0');
  assert.match(manifest.action.default_title, /ChatPatch/);
  assert.match(read('../sidepanel.html'), /<title>ChatPatch<\/title>/);
  assert.match(read('../sidepanel.html'), /<h1>ChatPatch<\/h1>/);
  assert.match(messages.vi['overview.description'], /ChatPatch/);
  assert.match(messages.en['overview.description'], /ChatPatch/);
});
test('previously linked folders, ZIP routing and permissions remain compatible', () => {
  assert.doesNotMatch(read('../background.js'), /const INBOX =/);
  assert.match(read('../background.js'), /absoluteFileUrl/);
  assert.match(read('../db.mjs'), /chatpatch-folder-handles-v1/);
  assert.match(read('../offscreen.js'), /\.chatpatch-backups/);
  assert.match(read('../db.mjs'), /LEGACY_DB_NAME/);
  assert.deepEqual(manifest.permissions, ['storage','tabs','downloads','sidePanel','offscreen']);
  assert.equal(manifest.background.service_worker, 'background.js');
});
