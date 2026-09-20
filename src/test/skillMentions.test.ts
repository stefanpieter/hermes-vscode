import assert from 'node:assert/strict';
import test from 'node:test';
import { findMentionQuery, parseMentions, splitMentionQuery } from '../mentions';
import { matchSkillMentions } from '../skillMentions';

const GROUPS = [
  { category: '', skills: [{ name: 'brandkit', description: 'Brand kits', category: '' }] },
  {
    category: 'software-development',
    skills: [
      { name: 'systematic-debugging', description: '4-phase root cause', category: 'software-development' },
      { name: 'test-driven-development', description: 'RED-GREEN-REFACTOR', category: 'software-development' },
    ],
  },
];

test('opens a skill query on @skill: and reports the prefix', () => {
  const found = findMentionQuery('use @skill:sys', 14);
  assert.ok(found);
  // The picker needs to know which catalogue to search, not just the text.
  assert.deepEqual(splitMentionQuery(found.query), { kind: 'skill', term: 'sys' });
});

test('a plain mention still means a file', () => {
  const found = findMentionQuery('read @src/a.ts', 14);
  assert.ok(found);
  assert.deepEqual(splitMentionQuery(found.query), { kind: 'file', term: 'src/a.ts' });
});

test('ranks name matches above description-only matches', () => {
  const groups = [
    {
      category: 'software-development',
      skills: [
        // Matches only in the description — the word appears in prose.
        { name: 'framer-agent-cli', description: 'Inspect/debug/edit Framer sites', category: 'software-development' },
        { name: 'systematic-debugging', description: '4-phase root cause', category: 'software-development' },
      ],
    },
  ];

  assert.deepEqual(
    matchSkillMentions(groups, 'debug').map(s => s.name),
    ['systematic-debugging', 'framer-agent-cli'],
  );
});

test('ranks a prefix match above a mid-name match', () => {
  const groups = [
    {
      category: 'x',
      skills: [
        { name: 'node-inspect-debugger', description: '', category: 'x' },
        { name: 'debug-tools', description: '', category: 'x' },
      ],
    },
  ];

  assert.deepEqual(
    matchSkillMentions(groups, 'debug').map(s => s.name),
    ['debug-tools', 'node-inspect-debugger'],
  );
});

test('ranks a word-boundary match above a mid-word one', () => {
  const groups = [
    {
      category: 'x',
      skills: [
        // `debugging` contains `debug` mid-word; `-debug` starts a segment.
        { name: 'frontend-runtime-debugging', description: '', category: 'x' },
        { name: 'python-debugpy', description: '', category: 'x' },
        { name: 'systematic-debugging', description: '', category: 'x' },
      ],
    },
  ];

  // All three contain the term, so a plain includes() left the useful one
  // buried under alphabetical order.
  assert.equal(matchSkillMentions(groups, 'debugging')[0].name, 'systematic-debugging');
});

test('matches a skill on name and on category', () => {
  assert.deepEqual(
    matchSkillMentions(GROUPS, 'debug').map(s => s.mention),
    ['skill:systematic-debugging'],
  );
  assert.deepEqual(
    matchSkillMentions(GROUPS, 'software').map(s => s.mention),
    ['skill:systematic-debugging', 'skill:test-driven-development'],
  );
});

test('an empty term lists every skill', () => {
  assert.equal(matchSkillMentions(GROUPS, '').length, 3);
});

test('parses a skill mention out of the message so it is not sent as a file', () => {
  // File mentions become resource_links; skill mentions must not, or the
  // host would try to resolve `skill:brandkit` as a path.
  const parsed = parseMentions('run @skill:brandkit on @src/a.ts');
  assert.deepEqual(parsed, ['skill:brandkit', 'src/a.ts']);
});
