import assert from 'node:assert/strict';
import test from 'node:test';
import { BackgroundMessageAccumulator, routeBackgroundMessage } from '../backgroundMessageAccumulator';

test('coalesces word-sized delayed chunks into one message', async () => {
  const emitted: Array<[string, string]> = [];
  const accumulator = new BackgroundMessageAccumulator((sessionId, text) => emitted.push([sessionId, text]), 10);

  accumulator.push('session-a', 'pre');
  accumulator.push('session-a', '-merge ');
  accumulator.push('session-a', 'simulation ');
  accumulator.push('session-a', 'required');

  await new Promise(resolve => setTimeout(resolve, 25));
  assert.deepEqual(emitted, [['session-a', 'pre-merge simulation required']]);
});

test('keeps delayed chunks isolated by ACP session', async () => {
  const emitted: Array<[string, string]> = [];
  const accumulator = new BackgroundMessageAccumulator((sessionId, text) => emitted.push([sessionId, text]), 10);

  accumulator.push('session-a', 'alpha ');
  accumulator.push('session-b', 'beta ');
  accumulator.push('session-a', 'done');
  accumulator.push('session-b', 'done');

  await new Promise(resolve => setTimeout(resolve, 25));
  assert.deepEqual(emitted.sort(), [
    ['session-a', 'alpha done'],
    ['session-b', 'beta done'],
  ]);
});


test('keeps concurrent process notifications isolated within one ACP session', async () => {
  const emitted: Array<[string, string]> = [];
  const accumulator = new BackgroundMessageAccumulator((sessionId, text) => emitted.push([sessionId, text]), 10);

  accumulator.push('session-a', 'process one ', 'proc-1');
  accumulator.push('session-a', 'process two ', 'proc-2');
  accumulator.push('session-a', 'done', 'proc-1');
  accumulator.push('session-a', 'done', 'proc-2');

  await new Promise(resolve => setTimeout(resolve, 25));
  assert.deepEqual(emitted.sort((a, b) => a[1].localeCompare(b[1])), [
    ['session-a', 'process one done'],
    ['session-a', 'process two done'],
  ]);
});

test('dispose flushes pending text once', () => {
  const emitted: Array<[string, string]> = [];
  const accumulator = new BackgroundMessageAccumulator((sessionId, text) => emitted.push([sessionId, text]), 1000);
  accumulator.push('session-a', 'complete response');

  accumulator.dispose();
  accumulator.dispose();

  assert.deepEqual(emitted, [['session-a', 'complete response']]);
});

test('disposed active panel persists by ACP session without rendering', () => {
  const actions: string[] = [];
  routeBackgroundMessage({
    sessionId: 'session-a',
    activeSessionId: 'session-a',
    text: 'coalesced response',
    canRender: false,
    persistActive: () => actions.push('persist-active'),
    persistBySession: (sessionId, text) => actions.push(`persist-session:${sessionId}:${text}`),
    render: () => actions.push('render'),
    broadcast: () => actions.push('broadcast'),
  });
  assert.deepEqual(actions, [
    'persist-session:session-a:coalesced response',
    'broadcast',
  ]);
});

test('live active panel persists once and renders once', () => {
  const actions: string[] = [];
  routeBackgroundMessage({
    sessionId: 'session-a',
    activeSessionId: 'session-a',
    text: 'coalesced response',
    canRender: true,
    persistActive: text => actions.push(`persist-active:${text}`),
    persistBySession: () => actions.push('persist-session'),
    render: text => actions.push(`render:${text}`),
    broadcast: () => actions.push('broadcast'),
  });
  assert.deepEqual(actions, [
    'persist-active:coalesced response',
    'render:coalesced response',
    'broadcast',
  ]);
});
