export interface PromptSessionManager {
  sendPrompt(
    text: string,
    cwd: string,
    onSessionBound?: (sessionId: string) => void,
    beforeSessionBinding?: () => Promise<void>,
  ): Promise<void>;
}

export interface PromptSessionStore {
  setAcpSessionId(sessionId: string): void;
}

/**
 * Start cancellation ownership before binding, while persisting ACP ownership
 * before session/prompt can emit delayed notifications.
 */
export async function sendPromptWithSessionBinding(
  session: PromptSessionManager,
  store: PromptSessionStore,
  text: string,
  cwd: string,
  beforeSessionBinding?: () => Promise<void>,
): Promise<void> {
  await session.sendPrompt(text, cwd, sessionId => {
    store.setAcpSessionId(sessionId);
  }, beforeSessionBinding);
}
