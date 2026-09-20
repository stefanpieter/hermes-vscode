import assert from 'node:assert/strict';
import test from 'node:test';
import { renderPlanBlock } from '../planBlock';
import type { TodoItem } from '../types';

const TODOS: TodoItem[] = [
  { content: 'Reproduce on current main', status: 'completed' },
  { content: 'Write failing test', status: 'completed' },
  { content: 'Pass cwd to create_session', status: 'in_progress', activeForm: 'Passing cwd' },
  { content: 'Backfill 8 existing rows', status: 'pending' },
];

test('shows progress in the header', () => {
  const html = renderPlanBlock(TODOS);
  assert.match(html, /2\/4/);
});

test('marks each state so the current step is findable at a glance', () => {
  const html = renderPlanBlock(TODOS);
  assert.equal((html.match(/plan-i done/g) ?? []).length, 2);
  assert.equal((html.match(/plan-i now/g) ?? []).length, 1);
});

test('uses the active phrasing for the step in progress', () => {
  // `activeForm` reads as what is happening now ("Passing cwd") rather than
  // the imperative backlog phrasing.
  const html = renderPlanBlock(TODOS);
  assert.match(html, /Passing cwd/);
  assert.ok(!html.includes('Pass cwd to create_session'));
});

test('renders nothing when there is no plan', () => {
  assert.equal(renderPlanBlock([]), '');
});

test('escapes todo text so a plan cannot inject markup', () => {
  const html = renderPlanBlock([{ content: '<img src=x onerror=1>', status: 'pending' }] as TodoItem[]);
  assert.ok(!html.includes('<img'));
});
