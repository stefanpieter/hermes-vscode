export interface PromptSessionManager {
  ensureSession(cwd: string): Promise<string>;
}

export interface PromptSessionStore {
  setAcpSessionId(sessionId: string): void;
}

/** Persist ACP ownership before session/prompt can emit delayed notifications. */
export async function bindPromptSession(
  session: PromptSessionManager,
  store: PromptSessionStore,
  cwd: string,
): Promise<string> {
  const sessionId = await session.ensureSession(cwd);
  store.setAcpSessionId(sessionId);
  return sessionId;
}
