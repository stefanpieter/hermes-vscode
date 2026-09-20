import assert from 'node:assert/strict';
import test from 'node:test';
import { EDIT_APPROVAL_MODES } from '../editApprovalMode';
import { resolveModeOptions } from '../modeCatalog';

// ACP sends SessionModeState on session/new:
//   availableModes  [{ id, name, description }]
//   currentModeId   "default"
// The extension hardcoded the same three modes. That is correct today and
// wrong the moment Hermes adds a fourth, so prefer what the server advertises
// and keep the built-in list only as the pre-session fallback.

test('prefers the modes ACP advertises over the built-in list', () => {
  const resolved = resolveModeOptions({
    currentModeId: 'plan',
    availableModes: [
      { id: 'default', name: 'Default', description: 'Ask before every file edit.' },
      { id: 'plan', name: 'Plan', description: 'Read-only planning mode.' },
    ],
  });

  assert.deepEqual(resolved.map(mode => mode.id), ['default', 'plan']);
  // Server copy wins: a future mode has no entry in the built-in table.
  assert.equal(resolved[1].label, 'Plan');
  assert.equal(resolved[1].description, 'Read-only planning mode.');
});

test('falls back to the built-in modes before any session has replied', () => {
  assert.deepEqual(resolveModeOptions(undefined), EDIT_APPROVAL_MODES);
  assert.deepEqual(resolveModeOptions({ availableModes: [] }), EDIT_APPROVAL_MODES);
});

test('skips advertised modes with no usable id', () => {
  const resolved = resolveModeOptions({
    availableModes: [
      { id: '', name: 'Broken' },
      { id: 'dont_ask', name: "Don't Ask" },
    ],
  });

  assert.deepEqual(resolved.map(mode => mode.id), ['dont_ask']);
});

test('falls back to the id when the server omits a display name', () => {
  const resolved = resolveModeOptions({
    availableModes: [{ id: 'accept_edits' }],
  });

  assert.equal(resolved[0].label, 'accept_edits');
  assert.equal(resolved[0].description, '');
});
