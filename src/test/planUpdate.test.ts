import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePlanUpdate } from '../protocol';

test('reads ACP plan entries into todo items', () => {
  // Hermes emits sessionUpdate: "plan" (acp_adapter/events.py) whenever the
  // todo tool runs. The extension parsed no such update, so every native plan
  // was dropped and only the text-scraping fallback ever fired.
  const todos = parsePlanUpdate({
    sessionUpdate: 'plan',
    entries: [
      { content: 'Reproduce on main', priority: 'medium', status: 'completed' },
      { content: 'Write failing test', priority: 'medium', status: 'in_progress' },
      { content: 'Backfill rows', priority: 'medium', status: 'pending' },
    ],
  });

  assert.equal(todos?.length, 3);
  assert.deepEqual(todos?.map(t => t.status), ['completed', 'in_progress', 'pending']);
  assert.equal(todos?.[0].content, 'Reproduce on main');
});

test('returns null for an update that is not a plan', () => {
  assert.equal(parsePlanUpdate({ sessionUpdate: 'tool_call' }), null);
});

test('treats an unknown status as pending rather than dropping the entry', () => {
  const todos = parsePlanUpdate({
    sessionUpdate: 'plan',
    entries: [{ content: 'x', status: 'weird' }],
  });

  assert.equal(todos?.length, 1);
  assert.equal(todos?.[0].status, 'pending');
});

test('an empty plan clears rather than renders an empty block', () => {
  assert.deepEqual(parsePlanUpdate({ sessionUpdate: 'plan', entries: [] }), []);
});
