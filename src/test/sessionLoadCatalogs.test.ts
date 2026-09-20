import assert from 'node:assert/strict';
import test from 'node:test';
import { SessionManager } from '../sessionManager';

/**
 * `session/load` returns the same `models`/`modes` fields as `session/new`
 * (acp_adapter/server.py:_session_response_fields). Dropping them on the resume
 * path silently demotes every restored window to the offline fallback list,
 * which is the one case a user cannot tell from a real inventory.
 */

interface Call { method: string; params: unknown }

function harness(loadResult: unknown) {
  const calls: Call[] = [];
  const events: any[] = [];
  const client = {
    call: async (method: string, params: unknown) => {
      calls.push({ method, params });
      if (method === 'session/load') return loadResult;
      if (method === 'session/new') return { sessionId: 'fresh' };
      return {};
    },
    isRunning: () => true,
    onNotification: () => {},
    onIncomingRequest: () => {},
  };
  const mgr = new SessionManager(client as never);
  mgr.onUpdate((e: unknown) => { events.push(e); });
  // A stored id is what sends ensureSession down the session/load path.
  mgr.setStoredSessionId('stored-session');
  return { mgr, calls, events };
}

const INVENTORY = {
  sessionId: 'stored-session',
  models: {
    currentModelId: 'claude-opus-5',
    availableModels: [
      { modelId: 'claude-opus-5', name: 'Claude Opus 5' },
      { modelId: 'local-llama', name: 'Local Llama' },
    ],
  },
  modes: {
    currentModeId: 'auto',
    availableModes: [{ id: 'auto', name: 'Auto' }, { id: 'manual', name: 'Manual' }],
  },
};

test('a resumed session forwards the advertised model inventory', async () => {
  const { mgr, events } = harness(INVENTORY);

  await mgr.ensureSession('C:/work');

  const withState = events.find(e => e.modelState);
  assert.ok(withState, 'session/load must emit the inventory, not discard it');
  assert.equal(withState.modelState.currentModelId, 'claude-opus-5');
  assert.equal(withState.modelState.availableModels.length, 2);
});

test('a resumed session forwards the advertised mode inventory', async () => {
  const { mgr, events } = harness(INVENTORY);

  await mgr.ensureSession('C:/work');

  const withState = events.find(e => e.modeState);
  assert.ok(withState, 'session/load must emit the modes it was given');
  assert.equal(withState.modeState.currentModeId, 'auto');
  assert.equal(withState.modeState.availableModes.length, 2);
});

test('a resume that carries no inventory emits no empty catalog', async () => {
  // An adapter too old to send catalogs must not blank a good picker.
  const { mgr, events } = harness({ sessionId: 'stored-session' });

  await mgr.ensureSession('C:/work');

  assert.ok(
    !events.some(e => e.modelState || e.modeState),
    'absent inventory must stay absent rather than emit an empty one',
  );
});
