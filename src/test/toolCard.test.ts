import assert from 'node:assert/strict';
import test from 'node:test';
import { toolDensity, renderToolCard } from '../toolCard';

test('gives a box to calls whose output is worth reading', () => {
  // read/edit/write show content the user wants to see inline.
  assert.equal(toolDensity({ label: 'read_file', body: 'def f():\n  pass' }), 'card');
  assert.equal(toolDensity({ label: 'edit', body: '- a\n+ b' }), 'card');
});

test('keeps quick lookups on one flat row', () => {
  // grep/glob/terminal are usually noise between the interesting steps; a box
  // each turns the transcript into a wall of frames.
  assert.equal(toolDensity({ label: 'grep', body: '' }), 'row');
  assert.equal(toolDensity({ label: 'terminal', body: '' }), 'row');
});

test('a call with no output stays a row even when its kind usually boxes', () => {
  // An empty box is pure noise: the frame says "look here" and there is
  // nothing inside.
  assert.equal(toolDensity({ label: 'read_file', body: '' }), 'row');
});

test('renders the header and body of a card', () => {
  const html = renderToolCard({
    label: 'read_file',
    target: 'session.py',
    status: 'L298-306',
    body: 'db.create_session(',
    state: 'done',
  });

  assert.match(html, /tool-card/);
  assert.match(html, /read_file/);
  assert.match(html, /session\.py/);
  assert.match(html, /L298-306/);
  assert.match(html, /db\.create_session\(/);
});

test('escapes tool output so a file cannot inject markup', () => {
  const html = renderToolCard({
    label: 'read_file',
    target: '<img src=x>',
    status: '',
    body: '<script>alert(1)</script>',
    state: 'done',
  });

  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img src=x>'));
});

test('marks an errored call so it reads differently from a finished one', () => {
  const failed = renderToolCard({
    label: 'edit', target: 'a.ts', status: '', body: 'boom', state: 'error',
  });
  const done = renderToolCard({
    label: 'edit', target: 'a.ts', status: '', body: 'ok', state: 'done',
  });

  assert.match(failed, /tool-card error/);
  assert.ok(!done.includes('tool-card error'));
});
