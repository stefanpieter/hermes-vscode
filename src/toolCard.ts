/**
 * Tool call rendering.
 *
 * Two densities on purpose. A quick lookup (grep, glob, terminal) is a single
 * flat row — boxing every call turns the transcript into a wall of frames. A
 * call whose output is worth reading (read, edit, write) gets a card with the
 * content inline, so the user does not have to expand it to see what changed.
 *
 * Pure string building: no DOM, so it is testable and lives under the main
 * tsconfig rather than in `webview/`.
 */

export type ToolDensity = 'card' | 'row';

export interface ToolDensityInput {
  label: string;
  body: string;
}

/** Tool kinds whose output the user usually wants to see inline. */
const CARD_KINDS = ['read', 'edit', 'write', 'diff', 'patch', 'create'];

export function toolDensity(input: ToolDensityInput): ToolDensity {
  // An empty box is pure noise: the frame says "look here" and there is
  // nothing inside. Content decides, not kind alone.
  if (!input.body.trim()) return 'row';

  const label = input.label.toLowerCase();
  return CARD_KINDS.some(kind => label.includes(kind)) ? 'card' : 'row';
}

export interface ToolCard {
  /** Tool name, e.g. `read_file`. */
  label: string;
  /** What it acted on, e.g. `session.py`. */
  target: string;
  /** Short status, e.g. `L298-306` or `+1 -1`. */
  status: string;
  /** Output to show inside the card. */
  body: string;
  state: 'running' | 'done' | 'error';
}

/**
 * A boxed tool card.
 *
 * The header is clickable to collapse the body; the caller wires that up. All
 * interpolated values come from the agent or the filesystem, so every one is
 * escaped.
 */
export function renderToolCard(card: ToolCard): string {
  const cls = card.state === 'error' ? 'tool-card error' : 'tool-card';
  const icon = card.state === 'running' ? '⋯' : card.state === 'error' ? '✗' : '●';
  const status = card.status
    ? `<span class="tool-card-st">${escapeHtml(card.status)}</span>`
    : '';

  return `<div class="${cls}">`
    + `<div class="tool-card-h">`
    + `<span class="tool-card-ic">${icon}</span>`
    + `<span class="tool-card-nm">${escapeHtml(card.label)}`
    + (card.target ? ` · ${escapeHtml(card.target)}` : '')
    + `</span>${status}</div>`
    + `<div class="tool-card-b">${renderBody(card.body)}</div>`
    + `</div>`;
}

/**
 * Colour diff lines inside a card body.
 *
 * A `-`/`+` prefix is the one piece of structure worth styling: it is what
 * makes an edit readable at a glance without opening the file.
 */
function renderBody(body: string): string {
  return body
    .split('\n')
    .map(line => {
      const escaped = escapeHtml(line);
      if (/^-(?!-)/.test(line)) return `<span class="tool-del">${escaped}</span>`;
      if (/^\+(?!\+)/.test(line)) return `<span class="tool-add">${escaped}</span>`;
      return escaped;
    })
    .join('\n');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
