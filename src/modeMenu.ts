/**
 * Edit-approval mode menu for the composer.
 *
 * The mode was reachable only through the Command Palette, which meant the
 * setting that decides whether Hermes asks before editing was invisible while
 * typing. This renders it beside Send.
 *
 * Pure string building: no DOM, so it is testable and lives under the main
 * tsconfig rather than in `webview/`.
 */

import type { EditApprovalModeOption } from './editApprovalMode';

/** Label for the composer button, falling back to the raw id. */
export function modeLabel(
  modes: readonly EditApprovalModeOption[],
  activeId: string,
): string {
  const match = modes.find(mode => mode.id === activeId);
  // The host may report a mode the advertised list does not contain, and an
  // unlabelled mode is still selectable; the id beats an empty button.
  return match?.label || activeId;
}

/**
 * Label for the composer button.
 *
 * Scoped with "Edits:" because the header already carries a profile chip that
 * can read "Default" too — two identical words meaning different things is
 * worse than a slightly longer label.
 */
export function modeButtonLabel(
  modes: readonly EditApprovalModeOption[],
  activeId: string,
): string {
  return `Edits · ${modeLabel(modes, activeId)}`;
}

export function renderModeMenu(
  modes: readonly EditApprovalModeOption[],
  activeId: string,
): string {
  return modes
    .map(mode => {
      const active = mode.id === activeId ? ' active' : '';
      const description = mode.description
        ? `<span class="mode-desc">${escapeHtml(mode.description)}</span>`
        : '';
      return `<div class="mode-option${active}" data-mode="${escapeHtml(mode.id)}">`
        + `<span class="mode-name">${escapeHtml(mode.label || mode.id)}</span>`
        + `${description}</div>`;
    })
    .join('');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
