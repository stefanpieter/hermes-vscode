import assert from 'node:assert/strict';
import test from 'node:test';

import { isKnownSlashCommand } from '../slashCommands';
import { acknowledgeStartedQueuedMessage } from '../webviewQueue';

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
      { text: '/queue verify after completion', isSlashCommand: true },
      { text: 'Explain the status', isSlashCommand: false },
    ],
    pendingSlashResponse: false,
  };

  const slash = acknowledgeStartedQueuedMessage(state, '/queue verify after completion', true);
  assert.deepEqual(slash, {
    text: '/queue verify after completion',
    isSlashCommand: true,
    renderUserMessage: false,
    showWaiting: false,
  });
  assert.equal(state.pendingSlashResponse, true);
  assert.deepEqual(state.pendingQueuedMessages, [
    { text: 'Explain the status', isSlashCommand: false },
  ]);

  const prose = acknowledgeStartedQueuedMessage(state, 'Explain the status', false);
  assert.deepEqual(prose, {
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
      { text: 'Explain the status', isSlashCommand: false },
    ],
    pendingSlashResponse: false,
  };

  const model = acknowledgeStartedQueuedMessage(state, '/model next-model', true);
  assert.equal(model.renderUserMessage, false);
  assert.equal(state.pendingSlashResponse, true);
  assert.deepEqual(state.pendingQueuedMessages, [
    { text: 'Explain the status', isSlashCommand: false },
  ]);
});
