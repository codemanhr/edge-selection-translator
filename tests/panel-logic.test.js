'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  analyzeSelection,
  shouldDismissPanel,
  readSelectionText,
  selectionAnchorPoint,
  isPasswordNode,
  normalizeSelectionText
} = require('../src/lib/panel-logic.js');
const { computePanelPosition } = require('../src/lib/position.js');

test('normalize collapses whitespace', function () {
  assert.equal(normalizeSelectionText('  hello \u00a0  world \n'), 'hello world');
});

test('empty and whitespace selections are ignored', function () {
  assert.equal(analyzeSelection({ text: '   ' }).reason, 'empty');
  assert.equal(analyzeSelection({ text: '' }).action, 'ignore');
});

test('a normal selection asks to show the panel', function () {
  const result = analyzeSelection({ text: 'Hello', enabled: true });
  assert.deepEqual(result, { action: 'show', reason: 'ok', text: 'Hello' });
});

test('code, password, disabled, and blacklist suppress the panel', function () {
  assert.equal(analyzeSelection({ text: 'const x = 1', inCode: true }).reason, 'code');
  assert.equal(analyzeSelection({ text: 'secret', inPassword: true }).reason, 'password');
  assert.equal(analyzeSelection({ text: 'hi', enabled: false }).reason, 'disabled');
  assert.equal(analyzeSelection({ text: 'hi', blacklisted: true }).reason, 'blacklist');
});

test('force overrides disabled and blacklist but not code or password', function () {
  assert.equal(analyzeSelection({ text: 'hi', enabled: false, force: true }).action, 'show');
  assert.equal(analyzeSelection({ text: 'hi', blacklisted: true, force: true }).action, 'show');
  assert.equal(analyzeSelection({ text: 'code', inCode: true, force: true }).reason, 'code');
  assert.equal(analyzeSelection({ text: 'pw', inPassword: true, force: true }).reason, 'password');
});

test('overlong selections surface an error and a clipped preview', function () {
  const result = analyzeSelection({ text: 'abcdef', maxLength: 4 });
  assert.equal(result.action, 'error');
  assert.equal(result.reason, 'too-long');
  assert.equal(result.text, 'abcd');
});

test('dismiss on Escape, outside pointer, and page scroll', function () {
  assert.equal(shouldDismissPanel({ type: 'keydown', key: 'Escape', panelOpen: true }), true);
  assert.equal(shouldDismissPanel({ type: 'keydown', key: 'Enter', panelOpen: true }), false);
  assert.equal(shouldDismissPanel({
    type: 'pointerdown',
    panelOpen: true,
    insidePanel: false
  }), true);
  assert.equal(shouldDismissPanel({
    type: 'pointerdown',
    panelOpen: true,
    insidePanel: true
  }), false);
  assert.equal(shouldDismissPanel({ type: 'scroll', panelOpen: true, insidePanel: false }), true);
  assert.equal(shouldDismissPanel({ type: 'scroll', panelOpen: true, insidePanel: true }), false);
  assert.equal(shouldDismissPanel({ type: 'keydown', key: 'Escape', panelOpen: false }), false);
});

test('readSelectionText ignores collapsed ranges', function () {
  assert.equal(readSelectionText({ isCollapsed: true, toString: () => 'hidden' }), '');
  assert.equal(readSelectionText({ isCollapsed: false, toString: () => '  hello  ' }), 'hello');
  assert.equal(readSelectionText(null), '');
});

test('selectionAnchorPoint uses the bottom-left of the range', function () {
  const selection = {
    rangeCount: 1,
    getRangeAt: function () {
      return {
        getBoundingClientRect: function () {
          return { left: 12, top: 20, bottom: 36, right: 80, width: 68, height: 16 };
        }
      };
    }
  };
  assert.deepEqual(selectionAnchorPoint(selection), { x: 12, y: 36 });
  assert.equal(selectionAnchorPoint({ rangeCount: 0, getRangeAt() { return null; } }), null);
});

test('password detection walks to the input', function () {
  const input = {
    nodeType: 1,
    type: 'password',
    closest: function () { return input; }
  };
  const text = { nodeType: 3, parentElement: input };
  assert.equal(isPasswordNode(text), true);
  const plain = {
    nodeType: 1,
    type: 'text',
    closest: function () { return plain; }
  };
  assert.equal(isPasswordNode(plain), false);
});

test('panel stays beside the cursor and flips near edges', function () {
  const panel = { width: 100, height: 80 };
  const viewport = { width: 800, height: 600 };
  assert.deepEqual(
    computePanelPosition({ x: 10, y: 10 }, panel, viewport, 8),
    { left: 18, top: 18 }
  );
  const flippedX = computePanelPosition({ x: 760, y: 20 }, panel, viewport, 8);
  assert.ok(flippedX.left < 760);
  assert.ok(flippedX.left + panel.width <= viewport.width - 8);
  const flippedY = computePanelPosition({ x: 20, y: 560 }, panel, viewport, 8);
  assert.ok(flippedY.top < 560);
  assert.ok(flippedY.top + panel.height <= viewport.height - 8);
});

test('panel is clamped when the anchor is outside the viewport', function () {
  const pos = computePanelPosition(
    { x: -50, y: 2000 },
    { width: 120, height: 40 },
    { width: 400, height: 300 },
    8
  );
  assert.ok(pos.left >= 8);
  assert.ok(pos.top >= 8);
  assert.ok(pos.left + 120 <= 392);
  assert.ok(pos.top + 40 <= 292);
});
