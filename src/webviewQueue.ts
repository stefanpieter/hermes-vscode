export interface QueuedWebviewMessage {
  text: string;
  isSlashCommand: boolean;
}

export interface QueuedMessageActivationState {
  pendingQueuedMessages: QueuedWebviewMessage[];
  pendingSlashResponse: boolean;
}

export interface ActivatedQueuedWebviewMessage extends QueuedWebviewMessage {
  renderUserMessage: boolean;
  showWaiting: boolean;
}

/**
 * Align the webview queue with the exact prompt the host confirms it started.
 * Host-only commands are supported even when no matching composer item exists.
 */
export function acknowledgeStartedQueuedMessage(
  state: QueuedMessageActivationState,
  text: string,
  isSlashCommand: boolean,
): ActivatedQueuedWebviewMessage {
  const index = state.pendingQueuedMessages.findIndex(message =>
    message.text === text && message.isSlashCommand === isSlashCommand,
  );
  const queued = index >= 0
    ? state.pendingQueuedMessages.splice(index, 1)[0]
    : { text, isSlashCommand };
  state.pendingSlashResponse = queued.isSlashCommand;
  return {
    ...queued,
    renderUserMessage: !queued.isSlashCommand,
    showWaiting: !queued.isSlashCommand,
  };
}
