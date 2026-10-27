'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const test = require('node:test');

const root = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function between(text, start, end) {
  const from = text.indexOf(start);
  const to = text.indexOf(end);
  assert.ok(from !== -1 && to > from, start);
  return text.slice(from + start.length, to).trim();
}

test('privacy policy names the data, every engine, local keys, and no sale or telemetry', function () {
  const md = read('privacy-policy.md');
  const html = read('docs/privacy-policy.html');
  for (const text of [md, html]) {
    assert.match(text, /选中/);
    assert.match(text, /www\.bing\.com/);
    assert.match(text, /translate\.googleapis\.com/);
    assert.match(text, /mymemory\.translated\.net/);
    assert.match(text, /deepl\.com/);
    assert.match(text, /api\.openai\.com/);
    assert.match(text, /libretranslate\.com/);
    assert.match(text, /cognitive\.microsofttranslator\.com/);
    assert.match(text, /chrome\.storage\.local/);
    assert.match(text, /不出售/);
    assert.match(text, /遥测/);
    assert.match(text, /does not sell|do not sell/i);
    assert.match(text, /Telemetry is none/);
  }
  assert.equal((html.match(/<script/gi) || []).length, 0);
  assert.match(html, /prefers-color-scheme:\s*dark/);
});

test('README is bilingual and the store listing matches the manifest', function () {
  const readme = read('README.md');
  const listing = read('STORE_LISTING.md');
  const manifest = JSON.parse(read('manifest.json'));
  assert.match(readme, /加载解压缩的扩展/);
  assert.match(readme, /edge:\/\/extensions/);
  assert.match(readme, /Partner Center/);
  assert.match(readme, /权限说明/);
  assert.match(readme, /## English/);
  assert.match(readme, /Load unpacked/);
  assert.match(listing, /划词翻译/);
  assert.match(listing, /Selection Translator/);
  assert.match(listing, /Productivity/);
  assert.ok(listing.includes(manifest.description));
  assert.ok(manifest.description.length <= 132);
  const zh = between(listing, '<!-- DESC_ZH_START -->', '<!-- DESC_ZH_END -->');
  const en = between(listing, '<!-- DESC_EN_START -->', '<!-- DESC_EN_END -->');
  assert.ok(zh.length >= 250 && zh.length <= 10000);
  assert.ok(en.length >= 250 && en.length <= 10000);
  assert.match(listing, /不出售/);
  assert.match(listing, /默认没有/);
});

test('icons are PNG at 16, 32, 48, and 128, and the pack zip is extension files only', function () {
  [16, 32, 48, 128].forEach(function (size) {
    const buf = fs.readFileSync(path.join(root, 'icons', 'icon' + size + '.png'));
    assert.equal(buf.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(buf.readUInt32BE(16), size);
    assert.equal(buf.readUInt32BE(20), size);
  });
  execFileSync(process.execPath, ['--check', path.join(root, 'scripts', 'pack.js')]);
  execFileSync(process.execPath, [path.join(root, 'scripts', 'pack.js')], { cwd: root });
  const zip = fs.readFileSync(path.join(root, 'dist', 'edge-selection-translator.zip'));
  assert.equal(zip.subarray(0, 2).toString(), 'PK');
  const names = [];
  let offset = 0;
  while (offset < zip.length - 4 && zip.readUInt32LE(offset) === 0x04034b50) {
    const nameLen = zip.readUInt16LE(offset + 26);
    const extraLen = zip.readUInt16LE(offset + 28);
    const compLen = zip.readUInt32LE(offset + 18);
    const name = zip.subarray(offset + 30, offset + 30 + nameLen).toString('utf8');
    names.push(name);
    offset += 30 + nameLen + extraLen + compLen;
  }
  assert.ok(names.includes('manifest.json'));
  assert.ok(names.includes('icons/icon128.png'));
  assert.ok(names.includes('src/content/content.js'));
  assert.equal(names.some(function (name) { return name.startsWith('tests/') || name === 'README.md'; }), false);
  ['panel', 'options', 'popup'].forEach(function (name) {
    const shot = fs.readFileSync(path.join(root, 'docs', 'screenshots', name + '.png'));
    assert.equal(shot.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(shot.readUInt32BE(16), 1280);
    assert.equal(shot.readUInt32BE(20), 800);
  });
});
