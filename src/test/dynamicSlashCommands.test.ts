import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_AVAILABLE_COMMANDS,
  isKnownSlashCommand,
  parseAvailableCommandsUpdate,
  slashCommandPresentation,
} from '../slashCommands';

test('parses the ACP available command feed and preserves argument hints', () => {
  const commands = parseAvailableCommandsUpdate({
    availableCommands: [
      { name: 'help', description: 'List current commands' },
      { name: 'model', description: 'Switch model', input: { hint: 'provider:model' } },
      { name: 'compress', description: 'Compress context' },
      { name: '../unsafe', description: 'must be rejected' },
      { name: 'HELP', description: 'duplicate must be rejected' },
    ],
  });

  assert.deepEqual(commands, [
    { name: 'help', description: 'List current commands' },
    { name: 'model', description: 'Switch model', inputHint: 'provider:model' },
    { name: 'compress', description: 'Compress context' },
  ]);
});

test('dynamic command feed is authoritative for additions, updates, and removals', () => {
  const commands = [
    { name: 'help', description: 'Updated help text' },
    { name: 'doctor', description: 'Run diagnostics' },
  ];

  assert.equal(isKnownSlashCommand('/doctor', commands), true);
  assert.equal(isKnownSlashCommand('/help', commands), true);
  assert.equal(isKnownSlashCommand('/compress', commands), false);
  assert.equal(isKnownSlashCommand('/compact', commands), false);
});

test('fallback catalog matches the current adapter rather than the obsolete menu', () => {
  assert.equal(isKnownSlashCommand('/compress now', DEFAULT_AVAILABLE_COMMANDS), true);
  assert.equal(isKnownSlashCommand('/compact now', DEFAULT_AVAILABLE_COMMANDS), false);
});

test('command presentation derives argument and confirmation behavior from metadata', () => {
  assert.deepEqual(
    slashCommandPresentation({ name: 'model', description: 'Switch model', inputHint: 'model name' }),
    { command: '/model', mode: 'prompt', argumentLabel: 'model name' },
  );
  assert.deepEqual(
    slashCommandPresentation({ name: 'reset', description: 'Clear history' }),
    {
      command: '/reset',
      mode: 'confirm',
      confirmation: 'Clear the entire conversation history? This cannot be undone.',
    },
  );
  assert.deepEqual(
    slashCommandPresentation({ name: 'doctor', description: 'Run diagnostics' }),
    { command: '/doctor', mode: 'execute' },
  );
});
