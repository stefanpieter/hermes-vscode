import assert from 'node:assert/strict';
import test from 'node:test';
import { applyProfileSelection } from '../profileSelection';

test('restarts a running ACP client when the selected profile changes', async () => {
  let currentProfile = '';
  const calls: string[] = [];

  const result = await applyProfileSelection('kinni', {
    currentProfile: () => currentProfile,
    persistProfile: async profile => { calls.push(`persist:${profile}`); },
    setCurrentProfile: profile => { currentProfile = profile; calls.push(`current:${profile}`); },
    setClientProfile: profile => { calls.push(`client:${profile}`); },
    isClientRunning: () => true,
    stopClient: () => { calls.push('stop'); },
    resetSession: () => { calls.push('reset'); },
    ensureConnected: async () => { calls.push('connect'); },
    setDisconnected: () => { calls.push('disconnected'); },
  });

  assert.deepEqual(result, { changed: true, profile: 'kinni', restarted: true });
  assert.deepEqual(calls, [
    'persist:kinni',
    'current:kinni',
    'client:kinni',
    'stop',
    'reset',
    'connect',
  ]);
});
