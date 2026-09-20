import assert from 'node:assert/strict';
import test from 'node:test';
import { renderTokenDisplay } from '../tokenDisplay';

test('shows the cache share when the prompt was largely served from cache', () => {
  // Hermes sends total = fresh + cache_read + cache_write, and the cached
  // portion separately. On a warm continuation the whole prompt can be
  // cached, which is the cheap case and worth surfacing.
  const html = renderTokenDisplay(210200, 205000, 5200, 1000000);
  assert.match(html, /210\.2k/);
  assert.match(html, /1M/);
  assert.match(html, /9[0-9]%/);
});

test('omits the cache share when nothing was cached', () => {
  // A cold turn has no cache signal; showing "0% cached" is noise.
  const html = renderTokenDisplay(12000, 0, 12000, 1000000);
  assert.ok(!html.includes('%'));
  assert.match(html, /12\.0k/);
});

test('never claims more than a full cache', () => {
  // Rounding across fresh/cached/total can push the ratio just past 1.
  const html = renderTokenDisplay(1000, 1200, 0, 1000000);
  assert.match(html, /100%/);
  // 120% would mean more cached than sent.
  assert.ok(!/1[1-9]\d%/.test(html));
});

test('stays well formed at zero', () => {
  assert.match(renderTokenDisplay(0, 0, 0, 1000000), /&gt;0&lt;|>0<\/span> \/ 1M/);
});

test('formats like the existing status bar, keeping the decimal', () => {
  // 210.2k, not 210k — matches fmtTok in webview/renderers.ts so the two
  // displays cannot drift apart.
  assert.match(renderTokenDisplay(210200, 0, 210200, 1000000), /210\.2k/);
});
