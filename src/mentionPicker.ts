/**
 * Mention picker behaviour.
 *
 * Pure helpers for the composer's `@` popup: selection movement and the text
 * replacement performed on accept. Kept out of `webview/` so it lives under the
 * main tsconfig and is unit-testable without a DOM.
 */

import type { MentionSuggestion } from './mentions';

export interface MentionCompletion {
  /** Current composer text. */
  text: string;
  /** Index of the `@` that opened the mention. */
  start: number;
  /** Caret position, i.e. the end of the typed query. */
  caret: number;
  /** Workspace-relative path being inserted. */
  mention: string;
}

/**
 * Replace the `@query` span with the chosen mention.
 *
 * Only the span between `start` and `caret` changes — text the user already
 * typed on either side survives, which is what makes the picker usable
 * mid-sentence. A trailing space is added when the mention ends the message so
 * the next keystroke does not extend it.
 */
export function applyMentionCompletion(
  completion: MentionCompletion,
): { text: string; caret: number } {
  const { text, start, caret, mention } = completion;
  const before = text.slice(0, start);
  const after = text.slice(caret);
  const inserted = `@${mention}`;
  const trailing = after.length === 0 ? ' ' : '';

  return {
    text: `${before}${inserted}${trailing}${after}`,
    caret: before.length + inserted.length + trailing.length,
  };
}

/**
 * Move the highlighted row, wrapping at both ends.
 *
 * Wrapping matters more than it looks: the list is capped, so a user holding
 * Down would otherwise stick silently at the last row.
 */
export function moveMentionSelection(
  current: number,
  count: number,
  direction: 'up' | 'down',
): number {
  if (count <= 0) {
    return 0;
  }
  const delta = direction === 'down' ? 1 : -1;
  return (current + delta + count) % count;
}

/** Markup for the picker rows. Values come from disk, so both are escaped. */
export function renderMentionOptions(
  suggestions: MentionSuggestion[],
  selected: number,
): string {
  return suggestions
    .map((suggestion, index) => {
      const active = index === selected ? ' active' : '';
      const name = escapeAttr(suggestion.name);
      const directory = escapeAttr(suggestion.directory);
      const dim = directory
        ? `<span style="opacity:0.45;font-size:0.82em"> ${directory}</span>`
        : '';
      return `<div class="mention-option${active}" data-mention="${escapeAttr(suggestion.mention)}">`
        + `${name}${dim}</div>`;
    })
    .join('');
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
