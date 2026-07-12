import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionManager } from '../sessionManager';
import type { SessionUpdateEvent } from '../types';

class FakeClient {
  notificationHandler: ((method: string, params: unknown) => void) | null = null;
  incomingRequestHandler: ((method: string, params: unknown) => Promise<unknown>) | null = null;
  promptResolve: (() => void) | null = null;
  holdPrompt = false;

  onNotification(handler: (method: string, params: unknown) => void): void {
    this.notificationHandler = handler;
  }

  onIncomingRequest(handler: (method: string, params: unknown) => Promise<unknown>): void {
    this.incomingRequestHandler = handler;
  }

  async call(method: string): Promise<unknown> {
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

  notify(): void {}

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
