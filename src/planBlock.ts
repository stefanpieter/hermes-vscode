/**
 * Inline plan block.
 *
 * The todo overlay is a floating panel pinned above the composer, so a plan
 * from ten turns ago looks as current as one from this turn. This renders the
 * same data inline in the transcript, where it belongs to the turn that
 * produced it and scrolls away with it.
 *
 * Pure string building: no DOM, so it is testable and lives under the main
 * tsconfig rather than in `webview/`.
 */

import type { TodoItem } from './types';

const STATE_CLASS: Record<string, string> = {
  completed: 'done',
  in_progress: 'now',
  cancelled: 'skip',
};

const STATE_MARK: Record<string, string> = {
  completed: '✓',
  in_progress: '',
  cancelled: '✗',
};

export function renderPlanBlock(todos: readonly TodoItem[]): string {
  if (!todos.length) return '';

  const done = todos.filter(todo => todo.status === 'completed').length;
  const rows = todos.map(todo => {
    const cls = STATE_CLASS[todo.status] ?? '';
    const mark = STATE_MARK[todo.status] ?? '';
    // `activeForm` reads as what is happening now rather than the imperative
    // backlog phrasing, which is what makes the current step obvious.
    const text = todo.status === 'in_progress' && todo.activeForm
      ? todo.activeForm
      : todo.content;
    return `<div class="plan-i ${cls}"><span class="plan-bx">${mark}</span>`
      + `${escapeHtml(text)}</div>`;
  }).join('');

  return `<div class="plan-block">`
    + `<div class="plan-t">Plan <span class="plan-n">${done}/${todos.length}</span></div>`
    + `${rows}</div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
