import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionSwitchUiMessages } from '../sessionSwitchUi';

test('restores target-session background status after clearing the previous session view', () => {
  const messages = sessionSwitchUiMessages('Session B', [
    { id: 'proc_active123', status: 'running' },
  ]);

  assert.deepEqual(messages, [
    { type: 'clear' },
    {
      type: 'statusBar',
      sessionTitle: 'Session B',
      backgroundProcesses: [{ id: 'proc_active123', status: 'running' }],
    },
  ]);
});
