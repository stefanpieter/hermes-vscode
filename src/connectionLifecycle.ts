export interface StartableAcpClient {
  readonly running: boolean;
  start(): Promise<void>;
}

/** Start ACP only when needed and announce only a real lifecycle transition. */
export async function ensureAcpClientStarted(
  client: StartableAcpClient,
  onConnecting: () => void,
  onConnected: () => void,
): Promise<boolean> {
  if (client.running) {
    // AcpClient.start() is single-flight: this also waits for an in-progress
    // initialize handshake without pretending an established child reconnected.
    await client.start();
    return false;
  }
  onConnecting();
  await client.start();
  onConnected();
  return true;
}
