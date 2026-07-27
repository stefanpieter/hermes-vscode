import assert from 'node:assert/strict';
import test from 'node:test';
import {
  mergeAgentActivities,
  parseAgentActivities,
  primaryAgentActivity,
  shouldPulseComposer,
} from '../agentActivity';

test('parses only explicit Hermes agent activity metadata', () => {
  assert.equal(parseAgentActivities({ sessionUpdate: 'tool_call', title: 'delegate task' }), null);

  const activities = parseAgentActivities({
    _meta: {
      hermes: {
        agentActivities: [
          {
            id: 'role-planner',
            name: 'Planner',
            status: 'running',
            contextUsed: 42000,
            contextSize: 100000,
          },
          {
            id: 'role-validator',
            name: 'Technical Validator',
            status: 'blocked',
          },
          { id: '', name: 'Invalid', status: 'running' },
          { id: 'invalid-status', name: 'Invalid', status: 'invented' },
        ],
      },
    },
  });

  assert.deepEqual(activities, [
    {
      id: 'role-planner',
      name: 'Planner',
      status: 'running',
      contextUsed: 42000,
      contextSize: 100000,
    },
    {
      id: 'role-validator',
      name: 'Technical Validator',
      status: 'blocked',
    },
  ]);
});

test('primary activity uses only authoritative prompt and context state', () => {
  assert.deepEqual(primaryAgentActivity(true, 64000, 128000), {
    id: 'primary',
    name: 'Hermes',
    status: 'running',
    contextUsed: 64000,
    contextSize: 128000,
  });
  assert.deepEqual(primaryAgentActivity(false), {
    id: 'primary',
    name: 'Hermes',
    status: 'idle',
  });
});

test('explicit runtime metadata replaces duplicate primary state without inventing roles', () => {
  const merged = mergeAgentActivities(
    primaryAgentActivity(false, 12000, 100000),
    [
      { id: 'primary', name: 'Lead / PM', status: 'running', contextUsed: 14000, contextSize: 100000 },
      { id: 'role-developer', name: 'Developer', status: 'completed' },
    ],
  );

  assert.deepEqual(merged, [
    { id: 'primary', name: 'Lead / PM', status: 'running', contextUsed: 14000, contextSize: 100000 },
    { id: 'role-developer', name: 'Developer', status: 'completed' },
  ]);
});

test('composer activity remains visible while authoritative standalone work is active', () => {
  assert.equal(shouldPulseComposer(false, [
    { id: 'role-run:developer', name: 'Developer', status: 'starting' },
  ]), true);
  assert.equal(shouldPulseComposer(false, [
    { id: 'role-run:developer', name: 'Developer', status: 'running' },
  ]), true);
  assert.equal(shouldPulseComposer(true, []), true);
  assert.equal(shouldPulseComposer(false, [
    { id: 'role-run:developer', name: 'Developer', status: 'completed' },
    { id: 'role-run:validator', name: 'Validator', status: 'idle' },
    { id: 'role-run:planner', name: 'Planner', status: 'blocked' },
  ]), false);
});
