import assert from 'node:assert/strict';
import test from 'node:test';
import { findMentionQuery, parseMentions, buildPromptBlocks } from '../mentions';

// Hermes resolves `resource_link` blocks by reading the file itself
// (acp_adapter/content.py::_resource_link_to_parts), so the extension only has
// to send the URI — it never inlines file contents into the prompt.

test('detects an @ query only while the caret sits inside it', () => {
  assert.deepEqual(findMentionQuery('look at @ses', 12), { query: 'ses', start: 8 });
  assert.deepEqual(findMentionQuery('@ses', 4), { query: 'ses', start: 0 });
  // A bare @ opens the picker with everything.
  assert.deepEqual(findMentionQuery('@', 1), { query: '', start: 0 });
  // Caret before the @ is not inside the mention.
  assert.equal(findMentionQuery('look at @ses', 4), undefined);
});

test('ignores an @ that is part of a word, an email, or already closed', () => {
  assert.equal(findMentionQuery('user@example.com', 16), undefined);
  assert.equal(findMentionQuery('a@b', 3), undefined);
  // Whitespace ends a mention: the caret is past it.
  assert.equal(findMentionQuery('@session.py and then', 20), undefined);
});

test('extracts mention paths from composed text', () => {
  assert.deepEqual(
    parseMentions('check @src/session.py against @tests/a_b.test.ts now'),
    ['src/session.py', 'tests/a_b.test.ts'],
  );
  assert.deepEqual(parseMentions('no mentions here'), []);
  // The same file twice is sent once.
  assert.deepEqual(parseMentions('@a.ts and @a.ts'), ['a.ts']);
});

test('builds a text block plus one resource_link per mentioned file', () => {
  const blocks = buildPromptBlocks('check @src/session.py please', [
    { mention: 'src/session.py', uri: 'file:///w/src/session.py', name: 'session.py' },
  ]);

  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks[0], { type: 'text', text: 'check @src/session.py please' });
  assert.deepEqual(blocks[1], {
    type: 'resource_link',
    uri: 'file:///w/src/session.py',
    name: 'session.py',
  });
});

test('sends a plain text block when nothing resolved to a file', () => {
  assert.deepEqual(buildPromptBlocks('hello', []), [{ type: 'text', text: 'hello' }]);
  // An unresolved mention stays as literal text rather than becoming a
  // resource_link to a path that does not exist.
  assert.deepEqual(buildPromptBlocks('check @nope.ts', []), [
    { type: 'text', text: 'check @nope.ts' },
  ]);
});
