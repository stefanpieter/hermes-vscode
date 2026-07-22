import assert from 'node:assert/strict';
import test from 'node:test';

import { isKnownSlashCommand } from '../slashCommands';
import {
  acknowledgeStartedQueuedMessage,
  createComposerRequestId,
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

test('rapid follow-up is queued before the host busy round-trip', () => {
  const state = {
    isBusy: false,
    pendingQueuedMessages: [] as Array<{
      requestId: string;
      text: string;
      isSlashCommand: boolean;
    }>,
  };

  assert.equal(registerSubmittedWebviewMessage(state, {
    requestId: 'composer-1', text: 'First', isSlashCommand: false,
  }), false);
  assert.equal(state.isBusy, true);
  assert.deepEqual(state.pendingQueuedMessages, []);

  assert.equal(registerSubmittedWebviewMessage(state, {
    requestId: 'composer-2', text: 'Second', isSlashCommand: false,
  }), true);
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

test('recreated webview hydrates active queue and slash response state', () => {
  const state = {
    isBusy: false,
    queueHydrated: false,
    prevQueueCount: 0,
    pendingSlashResponse: false,
  };

  hydrateWebviewQueueState(state, {
    active: true,
    queued: 2,
    activeSlashCommand: true,
  });

  assert.deepEqual(state, {
    isBusy: true,
    queueHydrated: true,
    prevQueueCount: 2,
    pendingSlashResponse: true,
  });
});
