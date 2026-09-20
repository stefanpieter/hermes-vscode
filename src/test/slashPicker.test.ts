import assert from 'node:assert/strict';
import test from 'node:test';
import { findSlashQuery, matchSlashCommands } from '../slashPicker';

const COMMANDS = [
  { name: 'model', description: 'Switch model' },
  { name: 'compact', description: 'Compact the conversation' },
  { name: 'clear', description: 'Clear history' },
];

test('opens only at the start of the message', () => {
  // A slash command is the whole message, so `/` mid-sentence is just text —
  // "and/or" must not open the palette.
  assert.deepEqual(findSlashQuery('/mod', 4), { query: 'mod' });
  assert.equal(findSlashQuery('and/or', 6), null);
  assert.equal(findSlashQuery('use /model', 10), null);
});

test('stays open only while the command is still one word', () => {
  // Once an argument is typed the command is chosen; the palette should close
  // rather than keep filtering on the argument.
  assert.deepEqual(findSlashQuery('/model', 6), { query: 'model' });
  assert.equal(findSlashQuery('/model opus', 11), null);
});

test('a bare slash lists everything', () => {
  assert.deepEqual(findSlashQuery('/', 1), { query: '' });
  assert.equal(matchSlashCommands(COMMANDS, '').length, 3);
});

test('ranks an exact name above a prefix above a description match', () => {
  const commands = [
    { name: 'compact', description: 'Shrink the model context' },
    { name: 'model', description: 'Switch model' },
  ];

  // `name` is the display label, so it keeps the leading slash; `mention` is
  // the bare command that gets inserted.
  assert.deepEqual(
    matchSlashCommands(commands, 'model').map(c => c.name),
    ['/model', '/compact'],
  );
});

test('ignores the caret when it sits before the text', () => {
  // Caret at 0 is not inside the command, so nothing should open.
  assert.equal(findSlashQuery('/model', 0), null);
});
