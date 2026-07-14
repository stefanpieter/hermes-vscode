/**
 * ACP protocol parsing helpers.
 *
 * Extracts typed data from raw ACP session/update notifications.
 * The sessionManager owns state (accumulated text, cancel flag);
 * this module owns parsing (extracting fields from wire format).
 */

import type { BackgroundProcessState, SessionUpdateEvent, TodoState } from './types';

type RawUpdate = Record<string, unknown>;

// ── Text extraction ──────────────────────────────────

/** Extract text content from an agent_message_chunk or agent_thought_chunk. */
export function extractTextContent(update: RawUpdate): string | null {
  const content = update.content as Record<string, unknown> | undefined;
  if (content?.type !== 'text' || typeof content.text !== 'string') return null;
  return content.text as string;
}

// ── Deduplication ────────────────────────────────────

export type DedupResult =
  | { action: 'drop' }
  | { action: 'emit'; text: string; newAccumulated: string };

/**
 * Deduplicate a streaming text chunk against accumulated text.
 *
 * Hermes ACP sends text as streaming deltas AND then resends the full
 * accumulated text at the end as a reliability fallback. Three patterns:
 *   1. Exact full resend: text === accumulated → drop
 *   2. Superset resend: text starts with accumulated → emit only new tail
 *   3. Partial resend: accumulated ends with text → drop
 *   4. Normal delta: append to accumulated
 */
export function deduplicateChunk(text: string, accumulated: string): DedupResult {
  if (text === accumulated) return { action: 'drop' };

  if (text.length > 10 && text.startsWith(accumulated)) {
    const newPart = text.slice(accumulated.length);
    if (!newPart) return { action: 'drop' };
    return { action: 'emit', text: newPart, newAccumulated: text };
  }

  if (text.length > 10 && accumulated.endsWith(text)) {
    return { action: 'drop' };
  }

  return { action: 'emit', text, newAccumulated: accumulated + text };
}

// ── Tool call parsing ────────────────────────────────

export interface ParsedToolCall {
  title: string;
  status: string;
  toolCallId?: string;
  kind: string;
  locations: string[];
  detail?: string;
  todoState?: TodoState;
}

/** Parse a tool_call update into typed fields. */
export function parseToolCall(update: RawUpdate): ParsedToolCall {
  const title = (update.title as string) ?? 'tool';
  const status = (update.status as string) ?? 'running';
  const toolCallId = update.toolCallId as string | undefined;
  const kind = (update.kind as string) ?? 'other';

  // Extract file paths from locations
  const rawLocations = update.locations as { path?: string }[] | undefined;
  const locations = rawLocations?.map(l => l.path).filter((p): p is string => !!p) ?? [];

  // Extract detail + todo state from rawInput
  let detail: string | undefined;
  let todoState: TodoState | undefined;
  const rawInput = update.rawInput as Record<string, unknown> | undefined;
  if (rawInput) {
    if (title === 'todo' && Array.isArray(rawInput.todos)) {
      todoState = rawInput as unknown as TodoState;
    } else {
      const firstVal = Object.values(rawInput).find(v => typeof v === 'string') as string | undefined;
      if (firstVal) detail = firstVal.length > 80 ? firstVal.slice(0, 77) + '…' : firstVal;
    }
  }

  return { title, status, toolCallId, kind, locations, detail, todoState };
}

// ── Tool call update parsing ─────────────────────────

export interface ParsedToolCallUpdate {
  toolCallId?: string;
  status: string;
  todoState?: TodoState;
  backgroundProcess?: BackgroundProcessState;
}

/** Parse a Hermes terminal/process tool result into persistent process state. */
export function parseBackgroundProcessFromToolUpdate(update: RawUpdate): BackgroundProcessState | undefined {
  const rawOutput = update.rawOutput ?? update.raw_output;
  let parsed: Record<string, unknown> | undefined;
  if (rawOutput && typeof rawOutput === 'object') {
    parsed = rawOutput as Record<string, unknown>;
  } else if (typeof rawOutput === 'string') {
    try {
      const value = JSON.parse(rawOutput);
      if (value && typeof value === 'object') parsed = value as Record<string, unknown>;
    } catch { /* unrelated non-JSON tool output */ }
  }
  if (!parsed) return undefined;
  const id = String(parsed.session_id ?? parsed.sessionId ?? '');
  if (!/^proc_[A-Za-z0-9]+$/.test(id)) return undefined;
  const output = String(parsed.output ?? '');
  const rawStatus = String(parsed.status ?? '').toLowerCase();
  const rawExitCode = parsed.exit_code ?? parsed.exitCode;
  const exitCode = typeof rawExitCode === 'number' ? rawExitCode : undefined;
  if (output.includes('Background process started') || rawStatus === 'running' || rawStatus === 'timeout') {
    return { id, status: 'running' };
  }
  if (rawStatus === 'exited' || rawStatus === 'completed') {
    return { id, status: exitCode === undefined || exitCode === 0 ? 'completed' : 'failed', ...(exitCode !== undefined ? { exitCode } : {}) };
  }
  if (['killed', 'lost', 'failed_start', 'failed', 'error'].includes(rawStatus)) {
    return { id, status: 'failed', ...(exitCode !== undefined ? { exitCode } : {}) };
  }
  return undefined;
}

/** Parse structured Hermes metadata on an asynchronous ACP message. */
export function parseBackgroundProcessMeta(update: RawUpdate): BackgroundProcessState | undefined {
  const meta = update['_meta'] as Record<string, unknown> | undefined;
  const hermes = meta?.hermes as Record<string, unknown> | undefined;
  const process = hermes?.process as Record<string, unknown> | undefined;
  if (!process) return undefined;
  const id = String(process.id ?? '');
  const status = String(process.status ?? '');
  if (!/^proc_[A-Za-z0-9]+$/.test(id) || !['running', 'completed', 'failed'].includes(status)) return undefined;
  const exitCode = typeof process.exitCode === 'number' ? process.exitCode : undefined;
  return { id, status: status as BackgroundProcessState['status'], ...(exitCode !== undefined ? { exitCode } : {}) };
}

/** Parse a tool_call_update, checking for todo and process JSON in output. */
export function parseToolCallUpdate(update: RawUpdate): ParsedToolCallUpdate {
  const toolCallId = update.toolCallId as string | undefined;
  const status = (update.status as string) ?? 'completed';

  const todoState = extractTodoFromUpdate(update);
  const backgroundProcess = parseBackgroundProcessFromToolUpdate(update);

  return { toolCallId, status, todoState, backgroundProcess };
}

// ── Todo detection ───────────────────────────────────

/** Try to extract TodoState from tool_call_update raw_output or content blocks. */
function extractTodoFromUpdate(update: RawUpdate): TodoState | undefined {
  // Check raw_output first
  const rawOutput = update.rawOutput ?? (update as RawUpdate).raw_output;
  if (typeof rawOutput === 'string' && rawOutput.includes('"todos"')) {
    const parsed = tryParseTodoJson(rawOutput);
    if (parsed) return parsed;
  }

  // Then check content blocks
  const contentBlocks = update.content as { content?: { text?: string } }[] | undefined;
  if (Array.isArray(contentBlocks)) {
    for (const block of contentBlocks) {
      const text = block?.content?.text;
      if (typeof text === 'string' && text.includes('"todos"')) {
        const parsed = tryParseTodoJson(text);
        if (parsed) return parsed;
      }
    }
  }

  return undefined;
}

/** Try to parse a string as TodoState JSON. Returns undefined on failure. */
function tryParseTodoJson(text: string): TodoState | undefined {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed?.todos)) return parsed as TodoState;
  } catch { /* not valid todo JSON */ }
  return undefined;
}

// ── Usage update parsing ─────────────────────────────

export interface ParsedUsageUpdate {
  contextUsed: number;
  contextSize: number;
}

/** Parse a usage_update. Returns null if fields are missing. */
export function parseUsageUpdate(update: RawUpdate): ParsedUsageUpdate | null {
  const size = update.size as number | undefined;
  const used = update.used as number | undefined;
  if (typeof size === 'number' && typeof used === 'number') {
    return { contextUsed: used, contextSize: size };
  }
  return null;
}

// ── Session info parsing ─────────────────────────────

/** Extract session title from a session_info_update. */
export function parseSessionInfoUpdate(update: RawUpdate): string | null {
  const title = update.title as string | undefined;
  return title?.trim() || null;
}
