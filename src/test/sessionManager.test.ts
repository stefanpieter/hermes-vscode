import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionManager } from '../sessionManager';
import type { SessionUpdateEvent } from '../types';

class FakeClient {
  notificationHandler: ((method: string, params: unknown) => void) | null = null;
  incomingRequestHandler: ((method: string, params: unknown) => Promise<unknown>) | null = null;
  promptResolve: (() => void) | null = null;
  sessionNewResolve: (() => void) | null = null;
  holdPrompt = false;
  holdSessionNew = false;
  failSetMode = false;
  emitBackgroundDuringLoad = false;
  promptResponse: unknown = {};
  calls: { method: string; params: unknown }[] = [];
  notifications: { method: string; params: unknown }[] = [];
  exitHandlers: Array<(code: number) => void> = [];

  on(event: string, handler: (code: number) => void): void {
    if (event === 'exit') this.exitHandlers.push(handler);
  }

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
      if (this.emitBackgroundDuringLoad) {
        this.emit('other-session', 'other session completed', true);
      }
      return {};
    }
    if (method === 'session/new') {
      if (this.holdSessionNew) {
        await new Promise<void>((resolve) => { this.sessionNewResolve = resolve; });
      }
      return { sessionId: 'active-session' };
    }
    if (method === 'session/prompt') {
      if (this.holdPrompt) {
        await new Promise<void>((resolve) => { this.promptResolve = resolve; });
      }
      return this.promptResponse;
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

  emitAutonomousTurn(sessionId: string, status: 'running' | 'completed' | 'failed', id = 'auto-proc'): void {
    this.emitUpdate(sessionId, {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'text', text: '' },
      _meta: {
        hermes: {
          backgroundNotification: true,
          autonomousTurn: { id, status, trigger: 'background_notification' },
          agentActivities: [{
            id: 'primary',
            name: 'Hermes Lead',
            status: status === 'running' ? 'running' : 'idle',
          }],
        },
      },
    });
  }

  emitExit(code = 1): void {
    for (const handler of this.exitHandlers) handler(code);
  }
}

function managerWithEvents(client: FakeClient): { manager: SessionManager; events: SessionUpdateEvent[] } {
  const manager = new SessionManager(client as never);
  const events: SessionUpdateEvent[] = [];
  manager.onUpdate((event) => events.push(event));
  return { manager, events };
}

test('deduplicates concurrent session binding requests', async () => {
  const client = new FakeClient();
  client.holdSessionNew = true;
  const { manager } = managerWithEvents(client);

  const first = manager.ensureSession('/tmp');
  const second = manager.ensureSession('/tmp');
  assert.equal(client.calls.filter(call => call.method === 'session/new').length, 1);

  client.sessionNewResolve?.();
  assert.deepEqual(await Promise.all([first, second]), ['active-session', 'active-session']);
});

test('reset invalidates an in-flight session binding', async () => {
  const client = new FakeClient();
  client.holdSessionNew = true;
  const { manager } = managerWithEvents(client);

  const binding = manager.ensureSession('/tmp');
  manager.reset();
  client.sessionNewResolve?.();

  await assert.rejects(binding, /superseded by reset/);
  assert.equal(manager.getSessionId(), null);
});

test('an ACP child exit forces the next prompt to load the persisted session before prompting', async () => {
  const client = new FakeClient();
  const { manager } = managerWithEvents(client);
  await manager.sendPrompt('first turn', '/tmp');
  assert.equal(manager.getSessionId(), 'active-session');

  client.calls.length = 0;
  client.emitExit(7);
  await manager.sendPrompt('after restart', '/tmp');

  assert.deepEqual(client.calls.map(call => call.method), [
    'session/load',
    'session/set_mode',
    'session/prompt',
  ]);
  assert.equal(
    (client.calls.at(-1)?.params as { sessionId?: string }).sessionId,
    'active-session',
  );
});

test('Stop while reconnect is pending prevents session binding and prompt startup', async () => {
  const client = new FakeClient();
  const { manager } = managerWithEvents(client);
  let reconnectResolve!: () => void;
  let reconnectStarted = false;
  const reconnect = async (): Promise<void> => {
    reconnectStarted = true;
    await new Promise<void>(resolve => { reconnectResolve = resolve; });
  };
  const sendPrompt = manager.sendPrompt.bind(manager) as (
    text: string,
    cwd: string,
    onSessionBound?: (sessionId: string) => void,
    beforeSessionBinding?: () => Promise<void>,
  ) => Promise<void>;

  const outcome = sendPrompt('cancel reconnect', '/tmp', undefined, reconnect)
    .then(() => 'resolved', (err: Error) => err.message);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(reconnectStarted, true, 'reconnect must run inside prompt ownership');

  await manager.cancel();
  reconnectResolve();

  assert.equal(await outcome, 'Cancelled');
  assert.deepEqual(client.calls, [], 'cancelled reconnect must not bind or prompt');
});

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

test('does not treat cumulative prompt response usage as current context pressure', async () => {
  const client = new FakeClient();
  client.promptResponse = {
    usage: {
      inputTokens: 2_710_235,
      outputTokens: 16_077,
      totalTokens: 2_726_312,
      cachedReadTokens: 2_341_504,
    },
  };
  const { manager, events } = managerWithEvents(client);

  await manager.sendPrompt('long tool turn', '/tmp');

  assert.equal(
    events.some(event => event.contextUsed !== undefined || event.cachedTokens !== undefined),
    false,
  );
});

test('keeps stream dedup isolated from an inactive session autonomous lifecycle', async () => {
  const client = new FakeClient();
  client.holdPrompt = true;
  const { manager, events } = managerWithEvents(client);
  const prompt = manager.sendPrompt('foreground work', '/tmp');
  await new Promise((resolve) => setImmediate(resolve));

  client.emit('active-session', 'Hello ');
  client.emitAutonomousTurn('inactive-session', 'running', 'inactive-turn');
  client.emit('active-session', 'Hello world');

  const activeChunks = events.filter(event =>
    event.session_id === 'active-session' && event.text !== undefined,
  );
  assert.deepEqual(activeChunks.map(event => event.text), ['Hello ', 'world']);
  const inactiveRunning = events.find(event =>
    event.session_id === 'inactive-session' && event.autonomousTurn?.status === 'running',
  );
  assert.equal(inactiveRunning?.background, false);

  client.promptResolve?.();
  await prompt;
});

test('keeps an autonomous continuation as one foreground turn with lifecycle boundaries', async () => {
  const client = new FakeClient();
  const { manager, events } = managerWithEvents(client);
  await manager.ensureSession('/tmp');

  client.emitAutonomousTurn('active-session', 'running');
  client.emit('active-session', 'Lead continues without a user nudge.');
  client.emitAutonomousTurn('active-session', 'completed');

  const started = events.find(event => event.autonomousTurn?.status === 'running');
  const response = events.find(event => event.text === 'Lead continues without a user nudge.');
  const completed = events.find(event => event.autonomousTurn?.status === 'completed');
  assert.equal(started?.background, false);
  assert.equal(response?.background, false);
  assert.equal(completed?.background, false);
});

test('routes an inactive session autonomous response without accepting unrelated cross-posts', async () => {
  const client = new FakeClient();
  const { manager, events } = managerWithEvents(client);
  await manager.ensureSession('/tmp');

  client.emitAutonomousTurn('inactive-session', 'running', 'inactive-turn');
  client.emit('inactive-session', 'Lead completed the old chat autonomously.');
  client.emitAutonomousTurn('inactive-session', 'completed', 'inactive-turn');
  client.emit('unrelated-session', 'must still be ignored');

  const response = events.find(
    event => event.text === 'Lead completed the old chat autonomously.',
  );
  assert.equal(response?.session_id, 'inactive-session');
  assert.equal(response?.autonomousTurnId, 'inactive-turn');
  assert.equal(response?.background, false);
  assert.equal(events.some(event => event.text === 'must still be ignored'), false);
});

test('Stop cancels a server-initiated autonomous continuation', async () => {
  const client = new FakeClient();
  const { manager } = managerWithEvents(client);
  await manager.ensureSession('/tmp');

  client.emitAutonomousTurn('active-session', 'running');
  await manager.cancel();

  assert.deepEqual(client.notifications, [{
    method: 'session/cancel',
    params: { sessionId: 'active-session' },
  }]);
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
  client.emit('other-session', 'other session completed', true);
  assert.equal(events.some(event => event.text === 'other session completed' && event.background), true);
  client.emitUpdate('other-session', {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'other-process-tool',
    status: 'completed',
    rawOutput: JSON.stringify({ output: 'Background process started', session_id: 'proc_other123' }),
    _meta: { hermes: { backgroundNotification: true } },
  });
  assert.equal(events.some(event => event.backgroundProcess?.id === 'proc_other123'), true);

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
  assert.equal(events.at(-1)?.replay, true);
});

test('does not misclassify another session background completion as load replay', async () => {
  const client = new FakeClient();
  client.emitBackgroundDuringLoad = true;
  const { manager, events } = managerWithEvents(client);
  manager.setStoredSessionId('stored-session');

  await manager.ensureSession('/tmp');

  const background = events.find(event => event.session_id === 'other-session');
  assert.equal(background?.background, true);
  assert.equal(background?.replay, false);
  assert.equal(background?.text, 'other session completed');
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

test('forwards the adapter advertised slash-command catalog', async () => {
  const client = new FakeClient();
  const { manager, events } = managerWithEvents(client);
  await manager.ensureSession('/tmp');

  client.emitUpdate('active-session', {
    sessionUpdate: 'available_commands_update',
    availableCommands: [
      { name: 'help', description: 'Current help' },
      { name: 'doctor', description: 'Run diagnostics', input: { hint: 'scope' } },
    ],
  });

  assert.deepEqual(events.at(-1)?.availableCommands, [
    { name: 'help', description: 'Current help' },
    { name: 'doctor', description: 'Run diagnostics', inputHint: 'scope' },
  ]);
});

test('forwards explicit agent activity carried by Hermes ACP metadata', async () => {
  const client = new FakeClient();
  const { manager, events } = managerWithEvents(client);
  await manager.ensureSession('/tmp');

  client.emitUpdate('active-session', {
    sessionUpdate: 'usage_update',
    used: 12000,
    size: 100000,
    _meta: {
      hermes: {
        compressionCount: 2,
        agentActivities: [
          { id: 'role-planner', name: 'Planner', status: 'running', contextUsed: 9000, contextSize: 100000 },
        ],
      },
    },
  });

  assert.deepEqual(events.at(-1)?.agentActivities, [
    { id: 'role-planner', name: 'Planner', status: 'running', contextUsed: 9000, contextSize: 100000 },
  ]);
  assert.equal(events.at(-1)?.compressionCount, 2);
});

test('forwards compression-only metadata updates without requiring token usage or a title', async () => {
  const client = new FakeClient();
  const { manager, events } = managerWithEvents(client);
  await manager.ensureSession('/tmp');

  client.emitUpdate('active-session', {
    sessionUpdate: 'usage_update',
    _meta: { hermes: { compressionCount: 3 } },
  });
  assert.equal(events.at(-1)?.compressionCount, 3);

  client.emitUpdate('active-session', {
    sessionUpdate: 'session_info_update',
    _meta: { hermes: { sessionProvenance: { compressionDepth: 4 } } },
  });
  assert.equal(events.at(-1)?.compressionCount, 4);
});
