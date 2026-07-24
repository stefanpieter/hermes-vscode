export interface QueuedWebviewMessage {
  requestId: string;
  text: string;
  isSlashCommand: boolean;
}

export interface QueuedMessageActivationState {
  queueHydrated?: boolean;
  pendingQueuedMessages: QueuedWebviewMessage[];
  pendingSlashResponse: boolean;
}

export interface SubmissionQueueState {
  isBusy: boolean;
  pendingQueuedMessages: QueuedWebviewMessage[];
}

export interface HydratableWebviewQueueState {
  isBusy: boolean;
  queueHydrated: boolean;
  prevQueueCount: number;
  pendingSlashResponse: boolean;
  pendingQueuedMessages: QueuedWebviewMessage[];
}

export interface HostQueueSnapshot {
  active: boolean;
  queued: number;
  activeSlashCommand: boolean;
  queuedItems: QueuedWebviewMessage[];
}

/** Build a request ID from a browser-provided UUID, unique across view lifetimes. */
export function createComposerRequestId(randomUuid: () => string): string {
  return `composer-${randomUuid()}`;
}

interface QueueMessageLike {
  requestId?: string;
  text: string;
  isSlashCommand: boolean;
}

/** Edit one pending queue entry without confusing duplicate message text. */
export function editQueuedMessage<T extends QueueMessageLike>(
  messages: T[],
  requestId: string,
  text: string,
  isSlashCommand: boolean,
): T | undefined {
  const queued = messages.find(message => message.requestId === requestId);
  if (!queued) return undefined;
  queued.text = text;
  queued.isSlashCommand = isSlashCommand;
  return queued;
}

/** Delete one pending queue entry by its stable composer request ID. */
export function deleteQueuedMessage<T extends QueueMessageLike>(
  messages: T[],
  requestId: string,
): T | undefined {
  const index = messages.findIndex(message => message.requestId === requestId);
  if (index < 0) return undefined;
  return messages.splice(index, 1)[0];
}

/** Publish only safe, composer-owned queue fields to the webview. */
export function editableQueuedMessages<T extends QueueMessageLike>(
  messages: T[],
): QueuedWebviewMessage[] {
  return messages.flatMap(message => message.requestId === undefined ? [] : [{
    requestId: message.requestId,
    text: message.text,
    isSlashCommand: message.isSlashCommand,
  }]);
}

/** Restore the host-owned runtime state when a webview document is recreated. */
export function hydrateWebviewQueueState(
  state: HydratableWebviewQueueState,
  snapshot: HostQueueSnapshot,
): void {
  state.isBusy = snapshot.active;
  state.queueHydrated = true;
  state.prevQueueCount = snapshot.queued;
  state.pendingSlashResponse = snapshot.active && snapshot.activeSlashCommand;
  state.pendingQueuedMessages = snapshot.queuedItems.map(message => ({ ...message }));
}

/**
 * Hold every submission locally until the host authoritatively confirms whether
 * it started or remains queued. This closes both sides of the busy-state race.
 */
export function registerSubmittedWebviewMessage(
  state: SubmissionQueueState,
  message: QueuedWebviewMessage,
): void {
  state.isBusy = true;
  state.pendingQueuedMessages.push(message);
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
  state: QueuedMessageActivationState & { queueHydrated: false },
  text: string,
  isSlashCommand: boolean,
  requestId?: string,
): undefined;
export function acknowledgeStartedQueuedMessage(
  state: QueuedMessageActivationState & { queueHydrated?: true },
  text: string,
  isSlashCommand: boolean,
  requestId?: string,
): ActivatedQueuedWebviewMessage;
export function acknowledgeStartedQueuedMessage(
  state: QueuedMessageActivationState,
  text: string,
  isSlashCommand: boolean,
  requestId?: string,
): ActivatedQueuedWebviewMessage | undefined;
export function acknowledgeStartedQueuedMessage(
  state: QueuedMessageActivationState,
  text: string,
  isSlashCommand: boolean,
  requestId?: string,
): ActivatedQueuedWebviewMessage | undefined {
  // A recreated webview may receive a live start event before its ready
  // handshake loads persisted history. The history already contains the
  // host-persisted user request, so rendering here would duplicate it.
  if (state.queueHydrated === false) return undefined;
  // Host-only commands (for example a model change) have no composer request
  // ID and therefore cannot consume a composer-owned queue entry.
  const index = requestId === undefined ? -1 : state.pendingQueuedMessages.findIndex(
    message => message.requestId === requestId,
  );
  if (index >= 0) state.pendingQueuedMessages.splice(index, 1);
  // startedText and startedSlashCommand come from the authoritative host. The
  // local copy may contain an optimistic edit that lost a handoff race.
  const queued = { requestId: requestId ?? '', text, isSlashCommand };
  state.pendingSlashResponse = queued.isSlashCommand;
  return {
    ...queued,
    renderUserMessage: !queued.isSlashCommand,
    showWaiting: !queued.isSlashCommand,
  };
}
