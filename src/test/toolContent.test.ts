import assert from 'node:assert/strict';
import test from 'node:test';
import { parseToolCall, parseToolCallUpdate, isToolFailure } from '../protocol';

test('captures the content blocks a tool call carries', () => {
  // acp_adapter/tools.py:695 attaches formatted results to every polished
  // tool, and tools.py:801 attaches diffs for write_file/patch. The extension
  // parsed title/status/kind/locations and dropped the payload, so tool output
  // never rendered.
  const parsed = parseToolCall({
    title: 'read_file',
    status: 'completed',
    kind: 'read',
    content: [{ type: 'content', content: { type: 'text', text: 'def f():\n  pass' } }],
  });

  assert.equal(parsed.content, 'def f():\n  pass');
});

test('joins multiple content blocks in order', () => {
  const parsed = parseToolCall({
    title: 'terminal',
    status: 'completed',
    content: [
      { type: 'content', content: { type: 'text', text: 'line one' } },
      { type: 'content', content: { type: 'text', text: 'line two' } },
    ],
  });

  assert.equal(parsed.content, 'line one\nline two');
});

test('reads content from a tool_call_update too', () => {
  // Output usually arrives on the update, not the initial call.
  const parsed = parseToolCallUpdate({
    toolCallId: 'tc-1',
    status: 'completed',
    content: [{ type: 'content', content: { type: 'text', text: 'done' } }],
  });

  assert.equal(parsed.content, 'done');
});

test('treats ACP failed as a failure; error is not an ACP status', () => {
  // acp/schema.py: ToolCallStatus is pending|in_progress|completed|failed.
  // The UI tested for 'error', which the agent never sends, so a failed tool
  // span forever instead of showing a cross.
  assert.equal(isToolFailure('failed'), true);
  assert.equal(isToolFailure('completed'), false);
  assert.equal(isToolFailure('in_progress'), false);
  assert.equal(isToolFailure(undefined), false);
});

test('still accepts error so an older agent keeps working', () => {
  assert.equal(isToolFailure('error'), true);
});

test('a tool call with no content leaves the field unset', () => {
  const parsed = parseToolCall({ title: 'grep', status: 'completed' });
  assert.equal(parsed.content, undefined);
});
