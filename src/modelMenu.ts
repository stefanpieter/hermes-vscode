/**
 * Model menu markup.
 *
 * Kept out of `webview/renderers.ts` deliberately: this is a pure
 * string->string function with no DOM dependency, so it lives under the main
 * tsconfig (which excludes `src/webview` and has no `dom` lib) and can be
 * unit-tested directly.
 */

import type { ModelMenuGroup } from './modelCatalog';

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Rebuild the model menu from a live inventory.
 *
 * The initial menu is baked into the page from the offline fallback; once ACP
 * advertises the real inventory the DOM has to be replaced, because
 * `updateStatusBar` resolves the active model's display label by scanning
 * `.model-option` nodes. Provider labels and model names come from the server,
 * so every interpolated value is escaped.
 */
export function renderModelMenu(groups: ModelMenuGroup[], currentModel: string): string {
  if (groups.length === 0) {
    return '';
  }

  return groups.map(group => {
    const options = group.items.map(item => {
      const isActive = item.command === currentModel
        || item.id === currentModel
        || item.command.endsWith(':' + currentModel);
      const active = isActive ? ' active' : '';
      return `<div class="model-option${active}" data-command="${escapeAttr(item.command)}">`
        + `${escapeAttr(item.label)}</div>`;
    }).join('');
    return `<div class="model-group-label">${escapeAttr(group.group)}</div>${options}`;
  }).join('<div class="model-sep"></div>');
}
