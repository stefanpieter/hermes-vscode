import assert from 'node:assert/strict';
import test from 'node:test';
import { parseBackgroundProcessFromToolUpdate } from '../protocol';

test('parses terminal background start results', () => {
  const state = parseBackgroundProcessFromToolUpdate({
    rawOutput: JSON.stringify({
      output: 'Background process started',
      session_id: 'proc_started123',
      pid: 1234,
      notify_on_complete: true,
    }),
  });
  assert.deepEqual(state, { id: 'proc_started123', status: 'running' });
});

test('parses process running and terminal states', () => {
  assert.deepEqual(parseBackgroundProcessFromToolUpdate({
    rawOutput: JSON.stringify({ session_id: 'proc_running123', status: 'running' }),
  }), { id: 'proc_running123', status: 'running' });
  assert.deepEqual(parseBackgroundProcessFromToolUpdate({
    rawOutput: JSON.stringify({ session_id: 'proc_done123', status: 'exited', exit_code: 0 }),
  }), { id: 'proc_done123', status: 'completed', exitCode: 0 });
  assert.deepEqual(parseBackgroundProcessFromToolUpdate({
    rawOutput: JSON.stringify({ session_id: 'proc_failed123', status: 'exited', exit_code: 2 }),
  }), { id: 'proc_failed123', status: 'failed', exitCode: 2 });
});

test('ignores unrelated tool output', () => {
  assert.equal(parseBackgroundProcessFromToolUpdate({ rawOutput: '{"todos":[]}' }), undefined);
});
