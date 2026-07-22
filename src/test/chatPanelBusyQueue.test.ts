import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import Module from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SessionManager } from '../sessionManager';

const moduleLoader = Module as unknown as {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
};
const vscodeWindow = {
  activeTextEditor: undefined as unknown,
  tabGroups: { all: [] },
  showInputBox: async (): Promise<string | undefined> => undefined,
};
const originalLoad = moduleLoader._load;
moduleLoader._load = function loadWithVscodeStub(
  request: string,
  parent: unknown,
  isMain: boolean,
): unknown {
  if (request === 'vscode') {
    return {
      Uri: {
        file: (fsPath: string) => ({ fsPath }),
        joinPath: (...parts: Array<{ fsPath?: string } | string>) => ({
          fsPath: parts.map(part => typeof part === 'string' ? part : part.fsPath ?? '').join('/'),
        }),
      },
      workspace: {
        workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
        asRelativePath: (value: { fsPath?: string } | string) =>
          typeof value === 'string' ? value : value.fsPath ?? '',
      },
      window: vscodeWindow,
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

// Load after installing the runtime stub: VS Code's API is only present inside
// the Extension Host, while this regression exercises host-side queue policy.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ChatPanelProvider } = require('../chatPanel') as typeof import('../chatPanel');
moduleLoader._load = originalLoad;

class BindingRaceClient {
  notificationHandler: ((method: string, params: unknown) => void) | null = null;
  incomingRequestHandler: ((method: string, params: unknown) => Promise<unknown>) | null = null;
  sessionNewResolve: (() => void) | null = null;
  calls: Array<{ method: string; params: unknown }> = [];
  notifications: Array<{ method: string; params: unknown }> = [];

  onNotification(handler: (method: string, params: unknown) => void): void {
    this.notificationHandler = handler;
  }

  onIncomingRequest(handler: (method: string, params: unknown) => Promise<unknown>): void {
    this.incomingRequestHandler = handler;
  }

  async call(method: string, params: unknown): Promise<unknown> {
    this.calls.push({ method, params });
    if (method === 'session/new') {
      await new Promise<void>(resolve => { this.sessionNewResolve = resolve; });
      return { sessionId: 'binding-session' };
    }
    return {};
  }

  notify(method: string, params: unknown): void {
    this.notifications.push({ method, params });
  }
}

test('Stop during first-session binding cancels that turn before queued work starts', async () => {
  const storageRoot = mkdtempSync(join(tmpdir(), 'hermes-vscode-binding-cancel-'));
  const state = new Map<string, unknown>();
  const context = {
    globalStorageUri: { fsPath: storageRoot },
    workspaceState: {
      get: <T>(key: string): T | undefined => state.get(key) as T | undefined,
      update: async (key: string, value: unknown): Promise<void> => { state.set(key, value); },
    },
  };
  const client = new BindingRaceClient();
  const session = new SessionManager(client as never);

  try {
    vscodeWindow.activeTextEditor = undefined;
    const provider = new ChatPanelProvider(
      { fsPath: '/extension' } as never,
      session,
      'test-model',
      'test-version',
      context as never,
    );
    const subject = provider as unknown as {
      store: { ensureSession(): void };
      post(message: Record<string, unknown>): void;
      handleFromWebview(message: Record<string, unknown>): Promise<void>;
    };
    subject.store.ensureSession();
    subject.post = () => {};

    await subject.handleFromWebview({ type: 'send', text: 'Cancel while binding', requestId: 'active' });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(client.calls.map(call => call.method), ['session/new']);

    await subject.handleFromWebview({ type: 'send', text: 'Run after cancellation', requestId: 'queued' });
    await subject.handleFromWebview({ type: 'cancel' });
    client.sessionNewResolve?.();
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));

    const promptTexts = client.calls
      .filter(call => call.method === 'session/prompt')
      .map(call => ((call.params as { prompt: Array<{ text: string }> }).prompt[0].text));
    assert.deepEqual(
      promptTexts,
      ['Run after cancellation'],
      'Stop during binding must cancel the owned turn instead of being reset before session/prompt',
    );
    const storedSessions = state.get('hermes.sessions') as Array<{ acpSessionId?: string }>;
    assert.equal(storedSessions[0].acpSessionId, 'binding-session');
  } finally {
    rmSync(storageRoot, { recursive: true, force: true });
  }
});

test('queues a follow-up submitted while busy without cancelling the active prompt', async () => {
  const storageRoot = mkdtempSync(join(tmpdir(), 'hermes-vscode-busy-queue-'));
  let cancelCalls = 0;
  let activePromptCalls = 0;
  let maxActivePromptCalls = 0;
  const prompts: string[] = [];
  const promptResolvers: Array<() => void> = [];
  const posted: Array<Record<string, unknown>> = [];
  const state = new Map<string, unknown>();
  const context = {
    globalStorageUri: { fsPath: storageRoot },
    workspaceState: {
      get: <T>(key: string): T | undefined => state.get(key) as T | undefined,
      update: async (key: string, value: unknown): Promise<void> => { state.set(key, value); },
    },
  };
  const session = {
    cancel: async (): Promise<void> => { cancelCalls += 1; },
    ensureSession: async (): Promise<string> => 'acp-session',
    sendPrompt: async (text: string): Promise<void> => {
      prompts.push(text);
      activePromptCalls += 1;
      maxActivePromptCalls = Math.max(maxActivePromptCalls, activePromptCalls);
      await new Promise<void>((resolve) => { promptResolvers.push(resolve); });
      activePromptCalls -= 1;
    },
  };

  try {
    vscodeWindow.activeTextEditor = undefined;
    const provider = new ChatPanelProvider(
      { fsPath: '/extension' } as never,
      session as never,
      'test-model',
      'test-version',
      context as never,
    );
    const subject = provider as unknown as {
      busy: boolean;
      lastTurnText: string;
      messageQueue: Array<{
        text: string;
        requestId?: string;
        attachedFiles: Array<{ name: string; path: string }>;
        selectedSkills: string[];
        ideContext: string;
      }>;
      attachedFiles: Array<{ name: string; path: string }>;
      selectedSkills: string[];
      store: { ensureSession(): void };
      post(message: Record<string, unknown>): void;
      saveTurnToSession(): void;
      capturePromptRequest(text: string): {
        text: string;
        isSlashCommand: boolean;
        attachedFiles: Array<{ name: string; path: string }>;
        selectedSkills: string[];
        ideContext: string;
      };
      handleFromWebview(message: Record<string, unknown>): Promise<void>;
    };
    subject.store.ensureSession();
    subject.post = (message) => { posted.push(message); };

    await subject.handleFromWebview({ type: 'send', text: 'Start the long task', requestId: 'active-1' });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(prompts, ['Start the long task']);

    vscodeWindow.activeTextEditor = {
      document: { uri: { fsPath: '/workspace/first.ts' } },
      selection: { isEmpty: true },
    };
    subject.attachedFiles = [{ name: 'first.md', path: '/context/first.md' }];
    subject.selectedSkills = ['first-skill'];
    await subject.handleFromWebview({
      type: 'send', text: 'Use the safer approach instead', requestId: 'queued-1',
    });

    vscodeWindow.activeTextEditor = {
      document: { uri: { fsPath: '/workspace/second.ts' } },
      selection: { isEmpty: true },
    };
    subject.attachedFiles = [{ name: 'second.md', path: '/context/second.md' }];
    subject.selectedSkills = ['second-skill'];
    await subject.handleFromWebview({
      type: 'send', text: 'Then verify the result', requestId: 'queued-2',
    });

    assert.equal(cancelCalls, 0, 'a normal follow-up must not hard-cancel the active ACP request');
    assert.deepEqual(subject.messageQueue.map(item => ({
      text: item.text,
      requestId: item.requestId,
      files: item.attachedFiles.map(file => file.path),
      skills: item.selectedSkills,
      ideContext: item.ideContext,
    })), [
      {
        text: 'Use the safer approach instead',
        requestId: 'queued-1',
        files: ['/context/first.md'],
        skills: ['first-skill'],
        ideContext: '[Active file: /workspace/first.ts]\n\n',
      },
      {
        text: 'Then verify the result',
        requestId: 'queued-2',
        files: ['/context/second.md'],
        skills: ['second-skill'],
        ideContext: '[Active file: /workspace/second.ts]\n\n',
      },
    ]);
    assert.deepEqual(subject.attachedFiles, []);
    assert.deepEqual(subject.selectedSkills, []);
    assert.deepEqual(posted.at(-1), { type: 'busy', active: true, queued: 2 });

    await subject.handleFromWebview({ type: 'ready' });
    assert.deepEqual(
      posted.filter(message => message.type === 'queueState').at(-1),
      { type: 'queueState', active: true, queued: 2, activeSlashCommand: false },
      'a recreated webview must inherit the live host queue state',
    );
    assert.deepEqual(
      (state.get('hermes.sessions') as Array<{ messages: Array<{ role: string; text: string }> }>)[0].messages,
      [{ role: 'user', text: 'Start the long task' }],
      'queued input must not be persisted ahead of the active turn response',
    );

    subject.lastTurnText = 'First answer';
    subject.saveTurnToSession();
    promptResolvers.shift()?.();
    await new Promise((resolve) => setImmediate(resolve));
    const startedFirstQueued = posted.find(message =>
      message.type === 'busy' && message.startedText === 'Use the safer approach instead',
    );
    assert.deepEqual(startedFirstQueued, {
      type: 'busy',
      active: true,
      queued: 1,
      startedText: 'Use the safer approach instead',
      startedSlashCommand: false,
      startedRequestId: 'queued-1',
    });
    assert.deepEqual(
      prompts.map(prompt => prompt.includes('Use the safer approach instead')
        ? 'first queued'
        : prompt.includes('Then verify the result') ? 'second queued' : prompt),
      ['Start the long task', 'first queued'],
      'the follow-up must start after the active prompt reaches its terminal response',
    );
    assert.match(prompts[1], /I advise you to use the following skills: first-skill/);
    assert.match(prompts[1], /\[Referenced file: \/context\/first\.md\]/);
    assert.match(prompts[1], /\[Active file: \/workspace\/first\.ts\]/);
    assert.doesNotMatch(prompts[1], /second-skill|second\.md|second\.ts/);
    assert.deepEqual(
      (state.get('hermes.sessions') as Array<{ messages: Array<{ role: string; text: string }> }>)[0].messages,
      [
        { role: 'user', text: 'Start the long task' },
        { role: 'agent', text: 'First answer' },
        { role: 'user', text: 'Use the safer approach instead' },
      ],
    );
    promptResolvers.shift()?.();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(prompts.length, 3);
    assert.match(prompts[2], /Then verify the result/);
    assert.match(prompts[2], /I advise you to use the following skills: second-skill/);
    assert.match(prompts[2], /\[Referenced file: \/context\/second\.md\]/);
    assert.match(prompts[2], /\[Active file: \/workspace\/second\.ts\]/);
    assert.doesNotMatch(prompts[2], /first-skill|first\.md|first\.ts/);
    promptResolvers.shift()?.();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(subject.busy, false);
    assert.equal(maxActivePromptCalls, 1, 'prompt-producing actions must remain serialized');

    subject.attachedFiles = [{ name: 'unused.md', path: '/context/unused.md' }];
    subject.selectedSkills = ['unused-skill'];
    assert.deepEqual(subject.capturePromptRequest('/queue verify after completion'), {
      text: '/queue verify after completion',
      isSlashCommand: true,
      attachedFiles: [],
      selectedSkills: [],
      ideContext: '',
    });
  } finally {
    rmSync(storageRoot, { recursive: true, force: true });
  }
});

test('queues model changes and keeps local title changes out of ACP while busy', async () => {
  const storageRoot = mkdtempSync(join(tmpdir(), 'hermes-vscode-busy-actions-'));
  let cancelCalls = 0;
  let activePromptCalls = 0;
  let maxActivePromptCalls = 0;
  const prompts: string[] = [];
  const posted: Record<string, unknown>[] = [];
  const promptResolvers: Array<() => void> = [];
  const state = new Map<string, unknown>();
  const context = {
    globalStorageUri: { fsPath: storageRoot },
    workspaceState: {
      get: <T>(key: string): T | undefined => state.get(key) as T | undefined,
      update: async (key: string, value: unknown): Promise<void> => { state.set(key, value); },
    },
  };
  const session = {
    cancel: async (): Promise<void> => { cancelCalls += 1; },
    ensureSession: async (): Promise<string> => 'acp-session',
    sendPrompt: async (text: string): Promise<void> => {
      prompts.push(text);
      activePromptCalls += 1;
      maxActivePromptCalls = Math.max(maxActivePromptCalls, activePromptCalls);
      await new Promise<void>(resolve => { promptResolvers.push(resolve); });
      activePromptCalls -= 1;
    },
  };

  try {
    vscodeWindow.activeTextEditor = undefined;
    const provider = new ChatPanelProvider(
      { fsPath: '/extension' } as never,
      session as never,
      'test-model',
      'test-version',
      context as never,
    );
    const subject = provider as unknown as {
      messageQueue: Array<{ text: string }>;
      store: {
        ensureSession(): void;
        activeId: string | undefined;
      };
      post(message: Record<string, unknown>): void;
      handleFromWebview(message: Record<string, unknown>): Promise<void>;
    };
    subject.store.ensureSession();
    subject.post = message => { posted.push(message); };
    vscodeWindow.showInputBox = async () => 'Renamed while busy';

    await subject.handleFromWebview({
      type: 'send',
      text: 'Run the active task',
      requestId: 'active-1',
    });
    await new Promise(resolve => setImmediate(resolve));
    await subject.handleFromWebview({ type: 'switchModel', model: 'next-model' });
    await subject.handleFromWebview({
      type: 'renameSession',
      sessionId: subject.store.activeId,
    });
    await subject.handleFromWebview({ type: 'cancel' });

    assert.equal(cancelCalls, 1, 'only the explicit Stop message should cancel');
    assert.deepEqual(subject.messageQueue.map(item => item.text), [
      '/model next-model',
    ]);
    assert.deepEqual(prompts, ['Run the active task']);

    promptResolvers.shift()?.();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(prompts, ['Run the active task', '/model next-model']);
    promptResolvers.shift()?.();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(prompts, ['Run the active task', '/model next-model']);
    assert.equal(maxActivePromptCalls, 1);

    await subject.handleFromWebview({ type: 'switchModel', model: 'idle-model' });
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(prompts, ['Run the active task', '/model next-model', '/model idle-model']);
    assert.equal(maxActivePromptCalls, 1);
    assert.ok(posted.some(message =>
      message.type === 'busy'
      && message.startedText === '/model idle-model'
      && message.startedSlashCommand === true
      && message.startedRequestId === undefined
    ), 'an idle host-only command should announce its slash-response semantics');
    await subject.handleFromWebview({ type: 'ready' });
    assert.deepEqual(
      posted.filter(message => message.type === 'queueState').at(-1),
      { type: 'queueState', active: true, queued: 0, activeSlashCommand: true },
      'a recreated webview must preserve the active slash-response styling',
    );
    promptResolvers.shift()?.();
    await new Promise(resolve => setImmediate(resolve));
  } finally {
    rmSync(storageRoot, { recursive: true, force: true });
  }
});
