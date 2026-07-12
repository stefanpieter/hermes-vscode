/** Coalesce delayed ACP text chunks into one persisted background message per session. */
export class BackgroundMessageAccumulator {
  private readonly pending = new Map<string, { text: string; timer: ReturnType<typeof setTimeout> }>();

  constructor(
    private readonly emit: (sessionId: string, text: string) => void,
    private readonly delayMs = 250,
  ) {}

  push(sessionId: string, text: string, notificationId = sessionId): void {
    if (!text) return;
    const key = `${sessionId}\u0000${notificationId}`;
    const current = this.pending.get(key);
    if (current) clearTimeout(current.timer);
    const combined = (current?.text ?? '') + text;
    const timer = setTimeout(() => this.flush(key), this.delayMs);
    this.pending.set(key, { text: combined, timer });
  }

  flush(key: string): void {
    const current = this.pending.get(key);
    if (!current) return;
    clearTimeout(current.timer);
    this.pending.delete(key);
    const separator = key.indexOf('\u0000');
    const sessionId = separator >= 0 ? key.slice(0, separator) : key;
    if (current.text) this.emit(sessionId, current.text);
  }

  dispose(): void {
    for (const key of [...this.pending.keys()]) this.flush(key);
  }
}

export interface BackgroundMessageRoute {
  sessionId: string;
  activeSessionId?: string;
  text: string;
  canRender: boolean;
  persistActive: (text: string) => void;
  persistBySession: (sessionId: string, text: string) => void;
  render: (text: string) => void;
  broadcast: () => void;
}

/** Route one coalesced message without ever rendering into a disposed view. */
export function routeBackgroundMessage(route: BackgroundMessageRoute): void {
  if (route.canRender && route.sessionId === route.activeSessionId) {
    route.persistActive(route.text);
    route.render(route.text);
  } else {
    route.persistBySession(route.sessionId, route.text);
  }
  route.broadcast();
}
