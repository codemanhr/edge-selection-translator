'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { chooseVoice, speakText, stopSpeech } = require('../src/lib/speech.js');

const voices = [
  { name: 'Google US English', lang: 'en-US', localService: false, default: true },
  { name: 'Bad News', lang: 'en-US', localService: true, default: false },
  { name: 'Samantha', lang: 'en-US', localService: true, default: true },
  { name: 'Alex', lang: 'en-US', localService: true, default: false },
  { name: 'Google 普通话', lang: 'zh-CN', localService: false, default: false },
  { name: 'Ting-Ting', lang: 'zh-CN', localService: true, default: true },
  { name: 'Microsoft Huihui', lang: 'zh-CN', localService: true, default: false },
  { name: 'eSpeak Chinese', lang: 'zh-CN', localService: true, default: false }
];

test('voice choice uses the local default for the requested language', function () {
  assert.equal(chooseVoice(voices, 'en-US').name, 'Samantha');
  assert.equal(chooseVoice(voices, 'zh-CN').name, 'Ting-Ting');
  assert.equal(chooseVoice(voices, 'zh-Hans').name, 'Ting-Ting');
  assert.equal(chooseVoice([
    { name: 'Google 普通话', lang: 'zh-CN', localService: false, default: true },
    { name: 'Microsoft Huihui', lang: 'zh-CN', localService: true, default: false }
  ], 'zh-CN').name, 'Microsoft Huihui');
  assert.equal(chooseVoice([
    { name: 'Samantha', lang: 'en-US', localService: true, default: true }
  ], 'zh-CN'), null);
});

test('speaking assigns that voice and stopping cancels the synth', function () {
  const spoken = [];
  let cancelled = 0;
  function FakeUtterance(text) { this.text = text; }
  const synth = {
    cancel: function () { cancelled += 1; },
    speak: function (utter) { spoken.push(utter); },
    getVoices: function () { return voices; }
  };
  const result = speakText('你好', 'zh-Hans', { synth: synth, Utterance: FakeUtterance });
  assert.equal(result.ok, true);
  assert.equal(result.options.voice, 'Ting-Ting');
  assert.equal(spoken[0].voice.name, 'Ting-Ting');
  assert.equal(spoken[0].lang, 'zh-CN');
  assert.equal(spoken[0].rate, 1);
  assert.equal(spoken[0].pitch, 1);
  assert.equal(cancelled, 1);
  assert.equal(stopSpeech({ synth: synth }), true);
  assert.equal(cancelled, 2);
  assert.equal(stopSpeech({}), false);
});

test('closing the panel and opening a new selection both stop speech', function () {
  const root = path.join(__dirname, '..');
  const content = fs.readFileSync(path.join(root, 'src/content/content.js'), 'utf8');
  const panel = fs.readFileSync(path.join(root, 'src/content/panel.js'), 'utf8');
  assert.equal(panel.includes('if (wasOpen) handlers.onClose()'), true);
  assert.equal(content.includes('onClose: function () {\n      stopSpeaking();'), true);
  assert.equal(content.includes('function requestTranslation(text, point) {\n    stopSpeaking();'), true);
  assert.equal(content.includes('function showMessage(anchor, original, status) {\n    stopSpeaking();'), true);
  const dismiss = content.split('doc.addEventListener').slice(1).join('\n');
  assert.equal(dismiss.split('controller.close()').length - 1, 3);
});
