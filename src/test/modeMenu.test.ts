import assert from 'node:assert/strict';
import test from 'node:test';
import { renderModeMenu, modeLabel, modeButtonLabel } from '../modeMenu';
import type { EditApprovalModeOption } from '../editApprovalMode';

// `id` is a narrow union in production. These fixtures deliberately include
// ids outside it to prove the renderer degrades rather than blanks when the
// agent advertises a mode this build does not know about.
const MODES = [
  { id: 'ask', label: 'Ask', description: 'Confirm every edit' },
  { id: 'auto', label: 'Auto', description: 'Apply edits automatically' },
] as unknown as EditApprovalModeOption[];

test('marks the active mode so the current one is obvious', () => {
  const html = renderModeMenu(MODES, 'auto');
  assert.equal((html.match(/mode-option active/g) ?? []).length, 1);
  assert.match(html, /mode-option active" data-mode="auto"/);
});

test('shows every advertised mode', () => {
  const html = renderModeMenu(MODES, 'ask');
  assert.match(html, /data-mode="ask"/);
  assert.match(html, /data-mode="auto"/);
});

test('escapes mode text so a server label cannot inject markup', () => {
  const html = renderModeMenu(
    [{ id: 'x"y', label: '<b>bad</b>', description: '<script>1</script>' }] as unknown as EditApprovalModeOption[],
    'x"y',
  );
  assert.ok(!html.includes('<b>bad</b>'));
  assert.ok(!html.includes('<script>'));
  assert.match(html, /data-mode="x&quot;y"/);
});

test('falls back to the id when a mode has no label', () => {
  const modes = [{ id: 'yolo', label: '', description: '' }] as unknown as EditApprovalModeOption[];
  assert.equal(modeLabel(modes, 'yolo'), 'yolo');
});

test('names the active mode for the composer button', () => {
  assert.equal(modeLabel(MODES, 'auto'), 'Auto');
});

test('scopes the button label so it cannot be read as the profile', () => {
  // The header already shows a profile chip that can also read "Default".
  // Two identical words meaning different things is worse than a prefix.
  assert.equal(modeButtonLabel(MODES, 'auto'), 'Edits · Auto');
});

test('an unknown active id does not blank the button', () => {
  // The host may report a mode the advertised list does not contain; showing
  // the raw id beats showing nothing.
  assert.equal(modeLabel(MODES, 'plan'), 'plan');
});
