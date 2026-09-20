/**
 * Inline `/` command palette.
 *
 * The toolbar already has a slash-command menu, but it must be clicked. This
 * lets the same commands complete as you type, reusing the `@` picker's popup.
 *
 * Pure: no DOM, no vscode, so it is unit-testable and lives under the main
 * tsconfig rather than in `webview/`.
 */

import type { AvailableSlashCommand } from './slashCommands';
import type { MentionSuggestion } from './mentions';

/**
 * The command being typed, if the caret is inside one.
 *
 * A slash command occupies the whole message, so this only opens on a leading
 * `/` — `and/or` and `use /model` are plain text. It also closes once a space
 * is typed, because by then the command is chosen and the rest is arguments.
 */
export function findSlashQuery(text: string, caret: number): { query: string } | null {
  if (!text.startsWith('/') || caret < 1) {
    return null;
  }
  const query = text.slice(1);
  if (/\s/.test(query)) {
    return null;
  }
  return { query };
}

/** Candidate commands for a query, best match first. */
export function matchSlashCommands(
  commands: readonly AvailableSlashCommand[],
  term: string,
): MentionSuggestion[] {
  const needle = term.trim().toLowerCase();

  const scored = commands
    .map(command => ({ command, score: scoreCommand(command, needle) }))
    .filter(entry => entry.score > 0);

  scored.sort((a, b) =>
    b.score - a.score
    || a.command.name.length - b.command.name.length
    || a.command.name.localeCompare(b.command.name));

  return scored.map(({ command }) => ({
    mention: command.name,
    name: `/${command.name}`,
    // Reuse the picker's dim suffix for the description, so slash commands
    // and mentions render through one code path.
    directory: command.description ?? '',
    uri: '',
  }));
}

/** Higher is a better match; 0 means no match at all. */
function scoreCommand(command: AvailableSlashCommand, needle: string): number {
  if (needle === '') return 1;

  const name = command.name.toLowerCase();
  if (name === needle) return 100;
  if (name.startsWith(needle)) return 80;
  if (name.includes(needle)) return 60;
  if ((command.description ?? '').toLowerCase().includes(needle)) return 20;
  return 0;
}
