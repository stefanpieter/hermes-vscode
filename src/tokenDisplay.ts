/**
 * Token display for the status bar.
 *
 * Hermes sends `inputTokens` as the TOTAL (fresh + cache_read + cache_write)
 * and `cachedReadTokens` as the cache_read portion. On a continuation turn
 * with a hot cache the entire prompt can be served from cache, so fresh = 0 is
 * legitimate rather than a broken counter.
 *
 * The old display tried "0 (+210.2k) / 1M" and read as a bug; it was then
 * reduced to total-only, discarding the cache numbers entirely. This shows the
 * window headline — the question people actually ask — with the cache share as
 * a secondary signal, which is the one cost lever a user can act on.
 *
 * Extracted from `webview/menus.ts` so it is unit-testable: that module is
 * excluded from the main tsconfig because it touches the DOM.
 */

/**
 * Compact token counts: 24100 -> 24.1k, 1000000 -> 1M.
 *
 * Mirrors the long-standing behaviour in `webview/renderers.ts`: one decimal
 * below 1M, so 210200 reads 210.2k rather than being rounded to 210k.
 */
export function fmtTok(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
  }
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${n}`;
}

export function renderTokenDisplay(
  total: number,
  cached: number,
  fresh: number,
  size: number,
): string {
  void fresh; // derived from total - cached; the ratio below is the useful form

  const headline = `<span style="color:var(--gold);font-weight:600">${fmtTok(total)}</span>`
    + ` / ${fmtTok(size)}`;

  // A cold turn has no cache signal, and "0% cached" is noise.
  if (!(total > 0) || !(cached > 0)) return headline;

  // Rounding across fresh/cached/total can push this just past 1.
  const ratio = Math.min(1, cached / total);
  const pct = Math.round(ratio * 100);

  return `${headline}`
    + `<span class="tok-cache" title="Served from the prompt cache — cached input tokens vs total">`
    + ` ${pct}%</span>`;
}
