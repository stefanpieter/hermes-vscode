import assert from 'node:assert/strict';
import test from 'node:test';

import { renderQueuedMessagesMarkup } from '../webview/queueControls';

const messages = [
  {
    requestId: 'composer-1',
    text: 'Review <img src=x onerror=alert(1)> & then verify',
    isSlashCommand: false,
  },
];

test('renders safe edit and delete controls for queued messages', () => {
  const markup = renderQueuedMessagesMarkup(messages);

  assert.match(markup, /data-action="edit"/);
  assert.match(markup, /data-action="delete"/);
  assert.match(markup, /data-request-id="composer-1"/);
  assert.match(markup, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(markup, /<img src=x/);
});

test('renders a multiline inline editor with save and cancel controls', () => {
  const markup = renderQueuedMessagesMarkup(messages, 'composer-1');

  assert.match(markup, /<textarea[^>]*class="queued-edit-input"/);
  assert.match(markup, /data-action="save"/);
  assert.match(markup, /data-action="cancel"/);
  assert.match(markup, /Review &lt;img src=x onerror=alert\(1\)&gt; &amp; then verify/);
  assert.doesNotMatch(markup, /data-action="delete"/);
});
