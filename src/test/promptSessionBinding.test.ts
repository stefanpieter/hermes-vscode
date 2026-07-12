import assert from 'node:assert/strict';
import test from 'node:test';
import { bindPromptSession } from '../promptSessionBinding';

test('binds a new ACP session to storage before prompt execution can begin', async () => {
  const order: string[] = [];
  const session = {
    async ensureSession(cwd: string): Promise<string> {
      order.push(`ensure:${cwd}`);
      return 'fresh-acp-session';
    },
  };
  const store = {
    setAcpSessionId(sessionId: string): void {
      order.push(`persist:${sessionId}`);
    },
  };

  const sessionId = await bindPromptSession(session, store, '/workspace');
  order.push(`prompt:${sessionId}`);

  assert.equal(sessionId, 'fresh-acp-session');
  assert.deepEqual(order, [
    'ensure:/workspace',
    'persist:fresh-acp-session',
    'prompt:fresh-acp-session',
  ]);
});
