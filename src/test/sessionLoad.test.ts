import assert from 'node:assert/strict';
import test from 'node:test';
import { isSessionLoaded, isPromptRefused } from '../protocol';

test('an empty object means the session was NOT loaded', () => {
  // acp_adapter/server.py:615 returns Python None for a missing session, but
  // the JSON-RPC layer serialises that as `"result": {}` rather than null.
  // The extension checked `result !== null`, logged "resumed", then prompted
  // into a session the agent had never heard of — chat silently did nothing.
  assert.equal(isSessionLoaded({}), false);
  assert.equal(isSessionLoaded(null), false);
  assert.equal(isSessionLoaded(undefined), false);
});

test('a populated response means the session really loaded', () => {
  // A real LoadSessionResponse carries the session fields (models/modes).
  assert.equal(isSessionLoaded({ models: { availableModels: [] } }), true);
  assert.equal(isSessionLoaded({ modes: {} }), true);
});

test('detects a refused prompt', () => {
  // Prompting a dead session returns stopReason "refusal" with no updates.
  assert.equal(isPromptRefused({ stopReason: 'refusal' }), true);
  assert.equal(isPromptRefused({ stopReason: 'end_turn' }), false);
  assert.equal(isPromptRefused({}), false);
  assert.equal(isPromptRefused(undefined), false);
});
