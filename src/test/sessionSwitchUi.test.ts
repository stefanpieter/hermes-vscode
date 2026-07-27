import assert from 'node:assert/strict';
import test from 'node:test';
import { sessionReadyUiMessages, sessionSwitchUiMessages } from '../sessionSwitchUi';

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

test('restores active-session background status when the webview becomes ready again', () => {
  const messages = sessionReadyUiMessages([
    { id: 'proc_active123', status: 'running' },
  ]);

  assert.deepEqual(messages, [
    {
      type: 'statusBar',
      backgroundProcesses: [{ id: 'proc_active123', status: 'running' }],
    },
  ]);
});

test('rehydrates authoritative agent activity, commands, and primary context with a session', () => {
  const messages = sessionSwitchUiMessages(
    'Role workflow',
    [],
    [{ id: 'role-planner', name: 'Planner', status: 'running', contextUsed: 8000, contextSize: 100000 }],
    [{ name: 'doctor', description: 'Run diagnostics' }],
    { contextUsed: 12000, contextSize: 200000, cachedTokens: 3000, compressionCount: 2 },
  );

  assert.deepEqual(messages, [
    { type: 'clear' },
    {
      type: 'statusBar',
      sessionTitle: 'Role workflow',
      backgroundProcesses: [],
      agentActivities: [
        { id: 'role-planner', name: 'Planner', status: 'running', contextUsed: 8000, contextSize: 100000 },
      ],
      availableCommands: [{ name: 'doctor', description: 'Run diagnostics' }],
      contextUsed: 12000,
      contextSize: 200000,
      cachedTokens: 3000,
      compressionCount: 2,
    },
  ]);
});
