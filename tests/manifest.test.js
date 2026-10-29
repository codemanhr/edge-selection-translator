'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');

function readManifest() {
  const raw = fs.readFileSync(path.join(root, 'manifest.json'), 'utf8');
  return JSON.parse(raw);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

test('manifest is MV3 with name, description, and icons', function () {
  const manifest = readManifest();
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.name && manifest.name.length <= 45);
  assert.ok(manifest.description && manifest.description.length <= 132);
  assert.equal(manifest.version, '1.0.6');
  for (const size of ['16', '32', '48', '128']) {
    assert.ok(manifest.icons[size]);
    const file = path.join(root, manifest.icons[size]);
    const buf = fs.readFileSync(file);
    assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  }
});

test('content script files exist and are ordered so libraries load first', function () {
  const manifest = readManifest();
  const scripts = manifest.content_scripts[0].js;
  assert.deepEqual(manifest.content_scripts[0].matches, ['http://*/*', 'https://*/*']);
  assert.equal(manifest.content_scripts[0].run_at, 'document_idle');
  for (const rel of scripts) {
    assert.equal(fs.existsSync(path.join(root, rel)), true, rel);
  }
  assert.ok(scripts.indexOf('src/lib/panel-logic.js') < scripts.indexOf('src/content/content.js'));
  assert.ok(scripts.indexOf('src/content/panel.js') < scripts.indexOf('src/content/content.js'));
  assert.ok(scripts.indexOf('src/lib/position.js') < scripts.indexOf('src/content/panel.js'));
  assert.equal(fs.existsSync(path.join(root, manifest.background.service_worker)), true);
});

test('extension CSP stays local and pages do not load remote scripts', function () {
  const manifest = readManifest();
  const csp = manifest.content_security_policy.extension_pages;
  assert.match(csp, /script-src 'self'/);
  assert.equal(csp.includes('http:'), false);
  assert.equal(manifest.content_scripts[0].js.some((file) => file.startsWith('http')), false);
});

test('every source JavaScript file parses', function () {
  const files = walk(path.join(root, 'src')).filter((file) => file.endsWith('.js'));
  assert.ok(files.length >= 5);
  for (const file of files) {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  }
});
