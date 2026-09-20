import assert from 'node:assert/strict';
import test from 'node:test';
import { buildModelGroups, resolveModelGroups } from '../modelCatalog';

// ACP sends the authenticated inventory on session/new:
//   name     "Anthropic · claude-opus-5"
//   modelId  "anthropic:claude-opus-5"
// The provider label is human-readable and already carried in `name`, so the
// picker never has to hardcode a provider list.

test('groups the live ACP inventory by its provider label', () => {
  const groups = buildModelGroups({
    currentModelId: 'anthropic:claude-opus-5',
    availableModels: [
      { modelId: 'anthropic:claude-opus-5', name: 'Anthropic · claude-opus-5' },
      { modelId: 'anthropic:claude-sonnet-5', name: 'Anthropic · claude-sonnet-5' },
      {
        modelId: 'openai-codex:gpt-6-astra',
        name: 'ChatGPT or Codex Subscription · gpt-6-astra',
      },
    ],
  });

  assert.deepEqual(
    groups.map(group => group.group),
    ['Anthropic', 'ChatGPT or Codex Subscription'],
  );
  assert.deepEqual(groups[0].items.map(item => item.label), [
    'claude-opus-5',
    'claude-sonnet-5',
  ]);
  // The id must round-trip verbatim: set_session_model is given back exactly
  // what the server advertised.
  assert.equal(groups[0].items[0].command, 'anthropic:claude-opus-5');
  assert.equal(groups[1].items[0].label, 'gpt-6-astra');
});

test('falls back to the id prefix when a name carries no provider label', () => {
  const groups = buildModelGroups({
    availableModels: [
      { modelId: 'custom:my-model', name: 'my-model' },
      { modelId: 'bare-model' },
    ],
  });

  assert.deepEqual(
    groups.map(group => group.group),
    ['custom', 'Models'],
  );
  assert.equal(groups[0].items[0].label, 'my-model');
  assert.equal(groups[1].items[0].label, 'bare-model');
  assert.equal(groups[1].items[0].command, 'bare-model');
});

test('returns no groups when the server advertises no inventory', () => {
  assert.deepEqual(buildModelGroups(undefined), []);
  assert.deepEqual(buildModelGroups({ availableModels: [] }), []);
});

test('prefers live inventory over the offline fallback, and keeps the fallback until it arrives', () => {
  const fallback = [
    { group: 'Anthropic', items: [{ id: 'a', label: 'a', command: 'anthropic:a' }] },
  ];
  const live = {
    availableModels: [{ modelId: 'anthropic:claude-opus-5', name: 'Anthropic · claude-opus-5' }],
  };

  // Before any session replies there is nothing to show but the fallback.
  assert.deepEqual(resolveModelGroups(undefined, fallback), fallback);
  assert.deepEqual(resolveModelGroups({ availableModels: [] }, fallback), fallback);

  // Once ACP advertises an inventory it wins outright — a stale hardcoded list
  // must never be merged into or appended to the authoritative one.
  const resolved = resolveModelGroups(live, fallback);
  assert.deepEqual(resolved.map(group => group.group), ['Anthropic']);
  assert.deepEqual(resolved[0].items.map(item => item.command), ['anthropic:claude-opus-5']);
});
