import assert from 'node:assert/strict';
import test from 'node:test';
import { parseToolCall, parseUsageFromPrompt } from '../protocol';

test('keeps the line number a tool location points at', () => {
  // acp_adapter/tools.py:850 sends ToolCallLocation(path=..., line=offset).
  // Only `path` survived parsing, so click-through always landed at line 1.
  const parsed = parseToolCall({
    title: 'read_file',
    status: 'completed',
    locations: [{ path: 'src/a.ts', line: 42 }],
  });

  assert.deepEqual(parsed.locations, ['src/a.ts']);
  assert.deepEqual(parsed.locationLines, [42]);
});

test('a location without a line leaves the slot empty rather than guessing', () => {
  const parsed = parseToolCall({
    title: 'read_file',
    status: 'completed',
    locations: [{ path: 'src/a.ts' }],
  });

  assert.deepEqual(parsed.locations, ['src/a.ts']);
  assert.deepEqual(parsed.locationLines, [undefined]);
});

test('reads per-turn usage off the prompt response', () => {
  // acp_adapter/server.py:983 returns Usage on every PromptResponse; the
  // return value was discarded, so cachedTokens was never populated and the
  // cache share always read 0.
  const usage = parseUsageFromPrompt({
    usage: {
      inputTokens: 210200,
      outputTokens: 1200,
      cachedReadTokens: 205000,
    },
  });

  assert.equal(usage?.contextUsed, 210200);
  assert.equal(usage?.cachedTokens, 205000);
});

test('accepts snake_case usage keys as well', () => {
  const usage = parseUsageFromPrompt({
    usage: { input_tokens: 500, cached_read_tokens: 400 },
  });

  assert.equal(usage?.contextUsed, 500);
  assert.equal(usage?.cachedTokens, 400);
});

test('returns nothing when the response carries no usage', () => {
  assert.equal(parseUsageFromPrompt({}), undefined);
  assert.equal(parseUsageFromPrompt({ usage: {} }), undefined);
});
