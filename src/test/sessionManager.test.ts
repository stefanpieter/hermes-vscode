import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionManager } from '../sessionManager';
import type { SessionUpdateEvent } from '../types';

class FakeClient {
  notificationHandler: ((method: string, params: unknown) => void) | null = null;
  incomingRequestHandler: ((method: string, params: unknown) => Promise<unknown>) | null = null;
  promptResolve: (() => void) | null = null;
  holdPrompt = false;
  failSetMode = false;
  calls: { method: string; params: unknown }[] = [];
  notifications: { method: string; params: unknown }[] = [];

  onNotification(handler: (method: string, params: unknown) => void): void {
    this.notificationHandler = handler;
  }

  onIncomingRequest(handler: (method: string, params: unknown) => Promise<unknown>): void {
    this.incomingRequestHandler = handler;
  }

  async call(method: string, params?: unknown): Promise<unknown> {
    this.calls.push({ method, params });
    if (method === 'session/set_mode' && this.failSetMode) {
      throw new Error('set mode failed');
    }
    if (method === 'session/load') {
      this.emit('stored-session', 'replayed history');
      return {};
    }
    if (method === 'session/new') return { sessionId: 'active-session' };
    if (method === 'session/prompt' && this.holdPrompt) {
      await new Promise<void>((resolve) => { this.promptResolve = resolve; });
    }
    return {};
  }

  notify(method: string, params: unknown): void {
    this.notifications.push({ method, params });
  }

  emitUpdate(sessionId: string, update: Record<string, unknown>): void {
    this.notificationHandler?.('session/update', { sessionId, update });
  }

  emit(sessionId: string, text: string, background = false, process?: Record<string, unknown>): void {
    this.notificationHandler?.('session/update', {
      sessionId,
      update: {
        sessionUpdate: 'agent_message_chunk',
        content: { type: 'text', text },
        ...(background ? { _meta: { hermes: { backgroundNotification: true, ...(process ? { process } : {}) } } } : {}),
      },
    });
  }
}

function managerWithEvents(client: FakeClient): { manager: SessionManager; events: SessionUpdateEvent[] } {
  const manager = new SessionManager(client as never);
  const events: SessionUpdateEvent[] = [];
  manager.onUpdate((event) => events.push(event));
  return { manager, events };
}

test('marks agent messages received after prompt completion as background', async () => {
  const client = new FakeClient();
  const { manager, events } = managerWithEvents(client);
  await manager.sendPrompt('start work', '/tmp');

  client.emit('active-session', 'background finished');

  assert.equal(events.at(-1)?.text, 'background finished');
  assert.equal(events.at(-1)?.background, true);
});

test('keeps streaming messages inside an active prompt as foreground', async () => {
  const client = new FakeClient();
  client.holdPrompt = true;
  const { manager, events } = managerWithEvents(client);
  const prompt = manager.sendPrompt('start work', '/tmp');
  await new Promise((resolve) => setImmediate(resolve));

  client.emit('active-session', 'streaming');

  assert.equal(events.at(-1)?.text, 'streaming');
  assert.equal(events.at(-1)?.background, false);
  client.promptResolve?.();
  await prompt;
});

test('cancel keeps the active turn pending until the ACP prompt terminates', async () => {
  const client = new FakeClient();
  client.holdPrompt = true;
  const { manager, events } = managerWithEvents(client);
  let settled = false;
  const outcome = manager.sendPrompt('start work', '/tmp')
    .then(() => 'resolved', (err: Error) => err.message)
    .finally(() => { settled = true; });
  await new Promise(resolve => setImmediate(resolve));

  await manager.cancel();
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(settled, false, 'local cancellation must not outrun the ACP terminal response');
  assert.deepEqual(client.notifications, [{
    method: 'session/cancel',
    params: { sessionId: 'active-session' },
  }]);
  client.emit('active-session', 'late cancelled output');
  assert.equal(events.some(event => event.text === 'late cancelled output'), false);

  client.promptResolve?.();
  assert.equal(await outcome, 'Cancelled');
});

test('ignores updates for a non-active ACP session', async () => {
  const client = new FakeClient();
  const { manager, events } = managerWithEvents(client);
  await manager.ensureSession('/tmp');

  client.emit('foreign-session', 'must not cross-post');

  assert.deepEqual(events.filter((event) => event.text), []);
});


test('honours Hermes background metadata while another prompt is active', async () => {
  const client = new FakeClient();
  client.holdPrompt = true;
  const { manager, events } = managerWithEvents(client);
  const prompt = manager.sendPrompt('foreground work', '/tmp');
  await new Promise((resolve) => setImmediate(resolve));

  client.emit('active-session', 'another process finished', true);

  assert.equal(events.at(-1)?.background, true);
  assert.equal(events.at(-1)?.text, 'another process finished');
  client.promptResolve?.();
  await prompt;
});


test('accepts session/load replay without treating it as a background notification', async () => {
  const client = new FakeClient();
  const { manager, events } = managerWithEvents(client);
  manager.setStoredSessionId('stored-session');

  const sessionId = await manager.ensureSession('/tmp');

  assert.equal(sessionId, 'stored-session');
  assert.equal(events.at(-1)?.text, 'replayed history');
  assert.equal(events.at(-1)?.background, false);
});

test('applies the configured edit-approval mode when creating a session', async () => {
  const client = new FakeClient();
  const manager = new SessionManager(client as never, () => {}, undefined, 'accept_edits');

  await manager.ensureSession('/workspace');

  assert.deepEqual(client.calls.slice(0, 2), [
    {
      method: 'session/new',
      params: { cwd: '/workspace', mcpServers: [] },
    },
    {
      method: 'session/set_mode',
      params: { sessionId: 'active-session', modeId: 'accept_edits' },
    },
  ]);
});

test('applies the configured edit-approval mode when loading a session', async () => {
  const client = new FakeClient();
  const manager = new SessionManager(client as never, () => {}, undefined, 'accept_edits');
  manager.setStoredSessionId('stored-session');

  await manager.ensureSession('/workspace');

  assert.deepEqual(client.calls.slice(0, 2), [
    {
      method: 'session/load',
      params: { sessionId: 'stored-session', cwd: '/workspace', mcpServers: [] },
    },
    {
      method: 'session/set_mode',
      params: { sessionId: 'stored-session', modeId: 'accept_edits' },
    },
  ]);
});

test('changes the mode of an active session without creating a replacement', async () => {
  const client = new FakeClient();
  const manager = new SessionManager(client as never);
  await manager.ensureSession('/workspace');
  client.calls = [];

  await manager.setEditApprovalMode('accept_edits', '/workspace');

  assert.deepEqual(client.calls, [
    {
      method: 'session/set_mode',
      params: { sessionId: 'active-session', modeId: 'accept_edits' },
    },
  ]);
});

test('keeps the previous mode when an active-session mode change fails', async () => {
  const client = new FakeClient();
  const manager = new SessionManager(client as never);
  await manager.ensureSession('/workspace');
  client.failSetMode = true;

  await assert.rejects(
    manager.setEditApprovalMode('accept_edits', '/workspace'),
    /set mode failed/,
  );

  assert.equal(manager.getEditApprovalMode(), 'default');
});


test('emits running process lifecycle from a terminal background tool result', async () => {
  const client = new FakeClient();
  const { manager, events } = managerWithEvents(client);
  await manager.ensureSession('/tmp');
  client.emitUpdate('active-session', {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'tool-1',
    status: 'completed',
    rawOutput: JSON.stringify({ output: 'Background process started', session_id: 'proc_live123' }),
  });
  assert.deepEqual(events.at(-1)?.backgroundProcess, { id: 'proc_live123', status: 'running' });
});

test('emits authoritative process completion from Hermes ACP metadata', async () => {
  const client = new FakeClient();
  const { manager, events } = managerWithEvents(client);
  await manager.ensureSession('/tmp');
  client.emit('active-session', 'finished', true, {
    id: 'proc_live123', status: 'completed', event: 'completion', exitCode: 0,
  });
  assert.deepEqual(events.at(-1)?.backgroundProcess, {
    id: 'proc_live123', status: 'completed', exitCode: 0,
  });
});


test('allows explicitly tagged completion for an inactive ACP session', async () => {
  const client = new FakeClient();
  const { manager, events } = managerWithEvents(client);
  await manager.ensureSession('/tmp');
  client.emit('inactive-session', 'hidden completion', true, {
    id: 'proc_hidden123', status: 'completed', event: 'completion', exitCode: 0,
  });
  assert.equal(events.at(-1)?.session_id, 'inactive-session');
  assert.equal(events.at(-1)?.background, true);
  assert.equal(events.at(-1)?.text, 'hidden completion');
});
