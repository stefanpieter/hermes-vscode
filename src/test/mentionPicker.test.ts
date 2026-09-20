import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMentionCompletion, moveMentionSelection, renderMentionOptions } from '../mentionPicker';

// The picker is driven from the composer: findMentionQuery (mentions.ts) says
// whether the caret is inside a mention, the host returns candidates, and
// these helpers own selection movement and the text replacement on accept.

test('replaces only the mention span and leaves the rest of the message intact', () => {
  const result = applyMentionCompletion({
    text: 'please read @ses and summarise',
    start: 12,
    caret: 16,
    mention: 'src/session.py',
  });

  assert.equal(result.text, 'please read @src/session.py and summarise');
  // Caret lands after the inserted mention, before the surviving text.
  assert.equal(result.caret, 'please read @src/session.py'.length);
});

test('appends a trailing space when the mention ends the message', () => {
  const result = applyMentionCompletion({
    text: 'look at @ses',
    start: 8,
    caret: 12,
    mention: 'session.py',
  });

  assert.equal(result.text, 'look at @session.py ');
  assert.equal(result.caret, result.text.length);
});

test('completes a bare @ without eating the character', () => {
  const result = applyMentionCompletion({
    text: '@',
    start: 0,
    caret: 1,
    mention: 'a.ts',
  });

  assert.equal(result.text, '@a.ts ');
});

test('wraps selection at both ends so arrow keys never dead-end', () => {
  assert.equal(moveMentionSelection(0, 3, 'down'), 1);
  assert.equal(moveMentionSelection(2, 3, 'down'), 0);
  assert.equal(moveMentionSelection(0, 3, 'up'), 2);
  assert.equal(moveMentionSelection(1, 3, 'up'), 0);
});

test('selection stays at zero when there is nothing to move through', () => {
  assert.equal(moveMentionSelection(0, 0, 'down'), 0);
  assert.equal(moveMentionSelection(0, 0, 'up'), 0);
});

test('marks the highlighted row without the model menu\'s selected-check semantics', () => {
  const html = renderMentionOptions(
    [
      { mention: 'a.ts', name: 'a.ts', directory: '', uri: 'file:///a.ts' },
      { mention: 'src/b.ts', name: 'b.ts', directory: 'src/', uri: 'file:///src/b.ts' },
    ],
    1,
  );

  // `.mention-option`, not `.model-option`: the latter renders a ✓ via ::before,
  // which would read as "already selected" in a list of candidates.
  assert.ok(!html.includes('model-option'));
  assert.equal((html.match(/mention-option active/g) ?? []).length, 1);
  assert.match(html, /mention-option active" data-mention="src\/b\.ts"/);
  assert.match(html, /data-mention="a\.ts"/);
});

test('escapes suggestion text so a filename cannot inject markup', () => {
  const html = renderMentionOptions(
    [{ mention: 'a"b.ts', name: '<b>x</b>', directory: '', uri: 'file:///x' }],
    0,
  );

  assert.ok(!html.includes('<b>x</b>'));
  assert.match(html, /data-mention="a&quot;b\.ts"/);
});
