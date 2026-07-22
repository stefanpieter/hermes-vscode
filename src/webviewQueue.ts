export interface QueuedWebviewMessage {
  requestId: string;
  text: string;
  isSlashCommand: boolean;
}

export interface QueuedMessageActivationState {
  pendingQueuedMessages: QueuedWebviewMessage[];
  pendingSlashResponse: boolean;
}

export interface SubmissionQueueState {
  isBusy: boolean;
  pendingQueuedMessages: QueuedWebviewMessage[];
}

/**
 * Claim the first submission synchronously so another send cannot race the
 * host's asynchronous busy notification. Returns true when this item queued.
 */
export function registerSubmittedWebviewMessage(
  state: SubmissionQueueState,
  message: QueuedWebviewMessage,
): boolean {
  if (!state.isBusy) {
    state.isBusy = true;
    return false;
  }
  state.pendingQueuedMessages.push(message);
  return true;
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
  requestId?: string,
): ActivatedQueuedWebviewMessage {
  const index = requestId === undefined ? -1 : state.pendingQueuedMessages.findIndex(
    message => message.requestId === requestId,
  );
  const queued = index >= 0
    ? state.pendingQueuedMessages.splice(index, 1)[0]
    : { requestId: requestId ?? '', text, isSlashCommand };
  state.pendingSlashResponse = queued.isSlashCommand;
  return {
    ...queued,
    renderUserMessage: !queued.isSlashCommand,
    showWaiting: !queued.isSlashCommand,
  };
}
