import assert from 'node:assert/strict';
import test from 'node:test';

import { isKnownSlashCommand } from '../slashCommands';
import {
  acknowledgeStartedQueuedMessage,
  createComposerRequestId,
  deleteQueuedMessage,
  editQueuedMessage,
  editableQueuedMessages,
  hydrateWebviewQueueState,
  registerSubmittedWebviewMessage,
} from '../webviewQueue';

test('host and webview share slash-command classification', () => {
  assert.equal(isKnownSlashCommand('/help'), true);
  assert.equal(isKnownSlashCommand('/STEER use the safer approach'), true);
  assert.equal(isKnownSlashCommand('/queue verify after completion'), true);
  assert.equal(isKnownSlashCommand('/status'), false);
  assert.equal(isKnownSlashCommand('/title locally handled only'), false);
  assert.equal(isKnownSlashCommand('/not-a-command'), false);
  assert.equal(isKnownSlashCommand('ordinary prose'), false);
});

test('queued slash commands retain system-response semantics during handoff', () => {
  const state = {
    pendingQueuedMessages: [
      { requestId: 'slash-1', text: '/queue verify after completion', isSlashCommand: true },
      { requestId: 'prose-1', text: 'Explain the status', isSlashCommand: false },
    ],
    pendingSlashResponse: false,
  };

  const slash = acknowledgeStartedQueuedMessage(
    state,
    '/queue verify after completion',
    true,
    'slash-1',
  );
  assert.deepEqual(slash, {
    requestId: 'slash-1',
    text: '/queue verify after completion',
    isSlashCommand: true,
    renderUserMessage: false,
    showWaiting: false,
  });
  assert.equal(state.pendingSlashResponse, true);
  assert.deepEqual(state.pendingQueuedMessages, [
    { requestId: 'prose-1', text: 'Explain the status', isSlashCommand: false },
  ]);

  const prose = acknowledgeStartedQueuedMessage(state, 'Explain the status', false, 'prose-1');
  assert.deepEqual(prose, {
    requestId: 'prose-1',
    text: 'Explain the status',
    isSlashCommand: false,
    renderUserMessage: true,
    showWaiting: true,
  });
  assert.equal(state.pendingSlashResponse, false);
  assert.deepEqual(state.pendingQueuedMessages, []);
});

test('host-only commands do not consume the next composer-queued message', () => {
  const state = {
    pendingQueuedMessages: [
      { requestId: 'prose-1', text: 'Explain the status', isSlashCommand: false },
    ],
    pendingSlashResponse: false,
  };

  const model = acknowledgeStartedQueuedMessage(state, '/model next-model', true);
  assert.equal(model.renderUserMessage, false);
  assert.equal(state.pendingSlashResponse, true);
  assert.deepEqual(state.pendingQueuedMessages, [
    { requestId: 'prose-1', text: 'Explain the status', isSlashCommand: false },
  ]);
});

test('host-only command cannot consume identical composer text', () => {
  const state = {
    pendingQueuedMessages: [
      { requestId: 'composer-1', text: '/model next-model', isSlashCommand: true },
    ],
    pendingSlashResponse: false,
  };

  const hostOnly = acknowledgeStartedQueuedMessage(state, '/model next-model', true, undefined);
  assert.equal(hostOnly.renderUserMessage, false);
  assert.deepEqual(state.pendingQueuedMessages, [
    { requestId: 'composer-1', text: '/model next-model', isSlashCommand: true },
  ]);

  const composer = acknowledgeStartedQueuedMessage(state, '/model next-model', true, 'composer-1');
  assert.equal(composer.requestId, 'composer-1');
  assert.deepEqual(state.pendingQueuedMessages, []);
});

test('host-confirmed start wins when an optimistic edit loses the handoff race', () => {
  const state = {
    pendingQueuedMessages: [
      { requestId: 'composer-1', text: '/queue optimistic edit', isSlashCommand: true },
    ],
    pendingSlashResponse: false,
  };

  const started = acknowledgeStartedQueuedMessage(
    state,
    'Original prose already shifted by the host',
    false,
    'composer-1',
  );

  assert.deepEqual(started, {
    requestId: 'composer-1',
    text: 'Original prose already shifted by the host',
    isSlashCommand: false,
    renderUserMessage: true,
    showWaiting: true,
  });
  assert.equal(state.pendingSlashResponse, false);
  assert.deepEqual(state.pendingQueuedMessages, []);
});

test('defers a start acknowledgement until recreated webview history is hydrated', () => {
  const state = {
    queueHydrated: false,
    pendingQueuedMessages: [],
    pendingSlashResponse: false,
  };

  const started = acknowledgeStartedQueuedMessage(
    state,
    'Persisted before the ready handshake',
    false,
    'composer-1',
  );

  assert.equal(started, undefined);
  assert.equal(state.pendingSlashResponse, false);
  assert.deepEqual(state.pendingQueuedMessages, []);
});

test('holds every composer submission pending until the authoritative host confirms its start', () => {
  const state = {
    isBusy: false,
    pendingSlashResponse: false,
    pendingQueuedMessages: [] as Array<{
      requestId: string;
      text: string;
      isSlashCommand: boolean;
    }>,
  };

  registerSubmittedWebviewMessage(state, {
    requestId: 'composer-1', text: 'First', isSlashCommand: false,
  });
  assert.equal(state.isBusy, true);
  assert.deepEqual(state.pendingQueuedMessages, [
    { requestId: 'composer-1', text: 'First', isSlashCommand: false },
  ]);

  const first = acknowledgeStartedQueuedMessage(state, 'First', false, 'composer-1');
  assert.equal(first.renderUserMessage, true);
  assert.deepEqual(state.pendingQueuedMessages, []);

  registerSubmittedWebviewMessage(state, {
    requestId: 'composer-2', text: 'Second', isSlashCommand: false,
  });
  assert.deepEqual(state.pendingQueuedMessages, [
    { requestId: 'composer-2', text: 'Second', isSlashCommand: false },
  ]);
});

test('composer request IDs remain unique across recreated webviews', () => {
  const first = createComposerRequestId(() => 'webview-a');
  const recreated = createComposerRequestId(() => 'webview-b');

  assert.equal(first, 'composer-webview-a');
  assert.equal(recreated, 'composer-webview-b');
  assert.notEqual(first, recreated);

  const state = {
    pendingQueuedMessages: [
      { requestId: recreated, text: 'New view follow-up', isSlashCommand: false },
    ],
    pendingSlashResponse: false,
  };
  const oldViewPrompt = acknowledgeStartedQueuedMessage(
    state,
    'Old view queued prompt',
    false,
    first,
  );

  assert.equal(oldViewPrompt.text, 'Old view queued prompt');
  assert.deepEqual(state.pendingQueuedMessages, [
    { requestId: recreated, text: 'New view follow-up', isSlashCommand: false },
  ]);
});

test('recreated webview hydrates active queue, editable messages, and slash response state', () => {
  const state = {
    isBusy: false,
    queueHydrated: false,
    prevQueueCount: 0,
    pendingSlashResponse: false,
    pendingQueuedMessages: [
      { requestId: 'stale', text: 'Stale webview item', isSlashCommand: false },
    ],
  };

  hydrateWebviewQueueState(state, {
    active: true,
    queued: 2,
    activeSlashCommand: true,
    queuedItems: [
      { requestId: 'queued-1', text: 'Editable after recreation', isSlashCommand: false },
    ],
  });

  assert.deepEqual(state, {
    isBusy: true,
    queueHydrated: true,
    prevQueueCount: 2,
    pendingSlashResponse: true,
    pendingQueuedMessages: [
      { requestId: 'queued-1', text: 'Editable after recreation', isSlashCommand: false },
    ],
  });
});

test('edits only the queued message with the matching stable request ID', () => {
  const queued = [
    { requestId: 'composer-1', text: 'Same text', isSlashCommand: false, context: 'first' },
    { requestId: 'composer-2', text: 'Same text', isSlashCommand: false, context: 'second' },
  ];

  const edited = editQueuedMessage(queued, 'composer-2', '/queue verify later', true);

  assert.equal(edited?.context, 'second');
  assert.deepEqual(queued, [
    { requestId: 'composer-1', text: 'Same text', isSlashCommand: false, context: 'first' },
    { requestId: 'composer-2', text: '/queue verify later', isSlashCommand: true, context: 'second' },
  ]);
});

test('deletes only the queued message with the matching stable request ID', () => {
  const queued = [
    { text: '/model host-only', isSlashCommand: true },
    { requestId: 'composer-1', text: 'Keep me', isSlashCommand: false },
    { requestId: 'composer-2', text: 'Delete me', isSlashCommand: false },
  ];

  const deleted = deleteQueuedMessage(queued, 'composer-2');

  assert.equal(deleted?.text, 'Delete me');
  assert.deepEqual(queued, [
    { text: '/model host-only', isSlashCommand: true },
    { requestId: 'composer-1', text: 'Keep me', isSlashCommand: false },
  ]);
});

test('publishes defensive editable summaries without exposing host-only queue items', () => {
  const queued = [
    { text: '/model host-only', isSlashCommand: true },
    { requestId: 'composer-1', text: 'Editable', isSlashCommand: false, secretContext: '/workspace/file.ts' },
  ];

  const summaries = editableQueuedMessages(queued);

  assert.deepEqual(summaries, [
    { requestId: 'composer-1', text: 'Editable', isSlashCommand: false },
  ]);
  queued[1].text = 'Changed internally';
  assert.equal(summaries[0].text, 'Editable');
});
