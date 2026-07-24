import type { QueuedWebviewMessage } from '../webviewQueue';

function escapeMarkup(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Render the host-owned editable queue without placing untrusted text into raw HTML. */
export function renderQueuedMessagesMarkup(
  messages: QueuedWebviewMessage[],
  editingRequestId?: string,
): string {
  return messages.map((message, index) => {
    const requestId = escapeMarkup(message.requestId);
    const text = escapeMarkup(message.text);
    const position = index + 1;
    if (message.requestId === editingRequestId) {
      return `<div class="queued-item editing" data-request-id="${requestId}">
        <textarea class="queued-edit-input" rows="3" aria-label="Edit queued message ${position}">${text}</textarea>
        <div class="queued-actions">
          <button type="button" class="queued-action primary" data-action="save">Save</button>
          <button type="button" class="queued-action" data-action="cancel">Cancel</button>
        </div>
      </div>`;
    }
    return `<div class="queued-item${message.isSlashCommand ? ' slash' : ''}" data-request-id="${requestId}">
      <div class="queued-item-position">${position}</div>
      <div class="queued-item-text" title="${text}">${text}</div>
      <div class="queued-actions">
        <button type="button" class="queued-action" data-action="edit" aria-label="Edit queued message ${position}">Edit</button>
        <button type="button" class="queued-action danger" data-action="delete" aria-label="Delete queued message ${position}">Delete</button>
      </div>
    </div>`;
  }).join('');
}
