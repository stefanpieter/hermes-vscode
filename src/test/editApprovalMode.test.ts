import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EDIT_APPROVAL_MODES,
  normalizeEditApprovalMode,
} from '../editApprovalMode';

test('exposes Hermes ACP edit modes with the secure per-edit mode first', () => {
  assert.deepEqual(
    EDIT_APPROVAL_MODES.map(mode => mode.id),
    ['default', 'accept_edits', 'dont_ask'],
  );
  assert.match(EDIT_APPROVAL_MODES[1].description, /workspace/i);
  assert.match(EDIT_APPROVAL_MODES[1].description, /sensitive/i);
});

test('normalizes unknown persisted edit modes to the secure default', () => {
  assert.equal(normalizeEditApprovalMode('accept_edits'), 'accept_edits');
  assert.equal(normalizeEditApprovalMode('dont_ask'), 'dont_ask');
  assert.equal(normalizeEditApprovalMode('unexpected'), 'default');
  assert.equal(normalizeEditApprovalMode(undefined), 'default');
});
