import assert from 'node:assert/strict';
import test from 'node:test';
import { sendPromptWithSessionBinding } from '../promptSessionBinding';

test('establishes prompt ownership before binding and persists before prompt execution', async () => {
  const order: string[] = [];
  const session = {
    async sendPrompt(
      text: string,
      cwd: string,
      onSessionBound?: (sessionId: string) => void,
    ): Promise<void> {
      order.push(`owned:${text}`);
      order.push(`ensure:${cwd}`);
      onSessionBound?.('fresh-acp-session');
      order.push('prompt:fresh-acp-session');
    },
  };
  const store = {
    setAcpSessionId(sessionId: string): void {
      order.push(`persist:${sessionId}`);
    },
  };

  await sendPromptWithSessionBinding(session, store, 'start work', '/workspace');

  assert.deepEqual(order, [
    'owned:start work',
    'ensure:/workspace',
    'persist:fresh-acp-session',
    'prompt:fresh-acp-session',
  ]);
});
