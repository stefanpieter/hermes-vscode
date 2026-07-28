import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureAcpClientStarted } from '../connectionLifecycle';

test('does not announce a reconnect when the ACP process is already running', async () => {
  const events: string[] = [];
  let startCalls = 0;
  const client = {
    running: true,
    start: async (): Promise<void> => { startCalls += 1; },
  };

  const started = await ensureAcpClientStarted(
    client,
    () => { events.push('connecting'); },
    () => { events.push('connected'); },
  );

  assert.equal(started, false);
  assert.equal(startCalls, 1, 'start still awaits an in-flight single-flight handshake');
  assert.deepEqual(events, []);
});

test('announces the real transition when a stopped ACP process starts', async () => {
  const events: string[] = [];
  const client = {
    running: false,
    start: async (): Promise<void> => { events.push('start'); },
  };

  const started = await ensureAcpClientStarted(
    client,
    () => { events.push('connecting'); },
    () => { events.push('connected'); },
  );

  assert.equal(started, true);
  assert.deepEqual(events, ['connecting', 'start', 'connected']);
});