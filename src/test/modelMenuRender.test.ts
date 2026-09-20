import assert from 'node:assert/strict';
import test from 'node:test';
import { renderModelMenu } from '../modelMenu';

// The model menu is baked into the initial HTML from the offline fallback.
// When ACP advertises the real inventory the menu has to be rebuilt in place,
// because updateStatusBar() resolves the active label by scanning
// `.model-option` nodes out of the DOM.

test('rebuilds the menu from live groups, preserving command ids verbatim', () => {
  const html = renderModelMenu(
    [
      {
        group: 'Anthropic',
        items: [
          { id: 'anthropic:claude-opus-5', label: 'claude-opus-5', command: 'anthropic:claude-opus-5' },
          { id: 'anthropic:claude-sonnet-5', label: 'claude-sonnet-5', command: 'anthropic:claude-sonnet-5' },
        ],
      },
      {
        group: 'Local',
        items: [{ id: 'ollama:qwen3', label: 'qwen3', command: 'ollama:qwen3' }],
      },
    ],
    'anthropic:claude-opus-5',
  );

  assert.match(html, /class="model-group-label">Anthropic</);
  assert.match(html, /class="model-group-label">Local</);
  assert.match(html, /data-command="anthropic:claude-opus-5"/);
  assert.match(html, /data-command="ollama:qwen3"/);
  // Exactly one option carries `active`, and it is the current model.
  assert.equal((html.match(/model-option active/g) ?? []).length, 1);
  assert.match(html, /model-option active" data-command="anthropic:claude-opus-5"/);
});

test('escapes provider and model text so inventory strings cannot inject markup', () => {
  const html = renderModelMenu(
    [
      {
        group: '<img src=x onerror=alert(1)>',
        items: [{ id: 'a"b', label: '<b>bold</b>', command: 'a"b' }],
      },
    ],
    '',
  );

  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<b>bold</b>'));
  assert.match(html, /&lt;img/);
  assert.match(html, /data-command="a&quot;b"/);
});

test('renders nothing for an empty inventory rather than an empty group shell', () => {
  assert.equal(renderModelMenu([], 'anything'), '');
});
