/**
 * ACP protocol parsing helpers.
 *
 * Extracts typed data from raw ACP session/update notifications.
 * The sessionManager owns state (accumulated text, cancel flag);
 * this module owns parsing (extracting fields from wire format).
 */

import type { AutonomousTurnState, BackgroundProcessState, SessionUpdateEvent, TodoState, TodoItem } from './types';

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
  /** Line each location points at, index-aligned with `locations`. */
  locationLines: (number | undefined)[];
  detail?: string;
  todoState?: TodoState;
  /** Formatted tool output: results, diffs, command text. */
  content?: string;
}

/**
 * Text from an ACP tool call's content blocks.
 *
 * `acp_adapter/tools.py` attaches formatted results to every polished tool and
 * diffs for write_file/patch. Blocks nest as `{type:'content', content:{type:
 * 'text', text}}`; anything that is not text (images, resource links) has no
 * inline representation here and is skipped.
 */
export function extractToolContent(update: RawUpdate): string | undefined {
  const blocks = update.content;
  if (!Array.isArray(blocks)) return undefined;

  const parts: string[] = [];
  for (const block of blocks) {
    const outer = block as { content?: unknown; text?: unknown };
    const inner = outer.content as { text?: unknown } | undefined;
    const text = typeof inner?.text === 'string'
      ? inner.text
      : typeof outer.text === 'string' ? outer.text : undefined;
    if (text) parts.push(text);
  }

  return parts.length > 0 ? parts.join('\n') : undefined;
}

/**
 * Whether a tool call ended in failure.
 *
 * ACP's ToolCallStatus is pending|in_progress|completed|failed. The UI
 * previously compared against `'error'`, which the agent never sends, so a
 * failed tool showed a spinner forever. `'error'` is still accepted so an
 * older agent keeps working.
 */
export function isToolFailure(status: string | undefined): boolean {
  return status === 'failed' || status === 'error';
}

/**
 * Whether a `session/load` response means the session actually loaded.
 *
 * `acp_adapter/server.py:615` returns Python `None` for a missing session, but
 * the JSON-RPC layer serialises that as `"result": {}` — not null. A
 * `result !== null` check therefore passes, the client logs "resumed", and the
 * next `session/prompt` is sent to a session the agent never heard of. It
 * answers `{"stopReason":"refusal"}` with no updates, so the chat accepts
 * input and silently never replies.
 *
 * A real LoadSessionResponse always carries session fields, so a response with
 * no keys means not-found.
 */
export function isSessionLoaded(result: unknown): boolean {
  if (result === null || result === undefined) return false;
  if (typeof result !== 'object') return false;
  return Object.keys(result as Record<string, unknown>).length > 0;
}

/** Whether a `session/prompt` response was refused outright (dead session). */
export function isPromptRefused(result: unknown): boolean {
  if (!result || typeof result !== 'object') return false;
  return (result as { stopReason?: unknown }).stopReason === 'refusal';
}

/** Parse a tool_call update into typed fields. */
export function parseToolCall(update: RawUpdate): ParsedToolCall {
  const title = (update.title as string) ?? 'tool';
  const status = (update.status as string) ?? 'running';
  const toolCallId = update.toolCallId as string | undefined;
  const kind = (update.kind as string) ?? 'other';

  // Extract file paths from locations
  const rawLocations = update.locations as { path?: string; line?: number }[] | undefined;
  const located = rawLocations?.filter((l): l is { path: string; line?: number } => !!l.path) ?? [];
  const locations = located.map(l => l.path);
  // Kept index-aligned with `locations` so a click can reveal the exact line
  // the tool touched instead of opening at the top of the file.
  const locationLines = located.map(l => (typeof l.line === 'number' ? l.line : undefined));

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

  return { title, status, toolCallId, kind, locations, locationLines, detail, todoState, content: extractToolContent(update) };
}

/**
 * Per-turn token usage from a `session/prompt` response.
 *
 * `acp_adapter/server.py:983` returns Usage on every PromptResponse. The
 * return value was discarded, so `cachedTokens` was never populated and the
 * status bar's cache share always read zero.
 */
export function parseUsageFromPrompt(
  response: RawUpdate,
): { contextUsed: number; cachedTokens?: number } | undefined {
  const usage = response.usage as Record<string, unknown> | undefined;
  if (!usage) return undefined;

  const num = (...keys: string[]): number | undefined => {
    for (const key of keys) {
      const value = usage[key];
      if (typeof value === 'number') return value;
    }
    return undefined;
  };

  const contextUsed = num('inputTokens', 'input_tokens');
  if (contextUsed === undefined) return undefined;

  return { contextUsed, cachedTokens: num('cachedReadTokens', 'cached_read_tokens') };
}

// ── Tool call update parsing ─────────────────────────

export interface ParsedToolCallUpdate {
  toolCallId?: string;
  status: string;
  todoState?: TodoState;
  backgroundProcess?: BackgroundProcessState;
  /** Formatted tool output — usually arrives here, not on the initial call. */
  content?: string;
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

/** Parse the lifecycle of a server-initiated continuation turn. */
export function parseAutonomousTurnMeta(update: RawUpdate): AutonomousTurnState | undefined {
  const meta = update['_meta'] as Record<string, unknown> | undefined;
  const hermes = meta?.hermes as Record<string, unknown> | undefined;
  const turn = hermes?.autonomousTurn as Record<string, unknown> | undefined;
  if (!turn) return undefined;
  const id = String(turn.id ?? '').trim();
  const status = String(turn.status ?? '');
  const trigger = String(turn.trigger ?? '');
  if (!id || !['running', 'completed', 'failed'].includes(status)
    || trigger !== 'background_notification') return undefined;
  return {
    id,
    status: status as AutonomousTurnState['status'],
    trigger: 'background_notification',
  };
}

/** Parse a tool_call_update, checking for todo and process JSON in output. */
export function parseToolCallUpdate(update: RawUpdate): ParsedToolCallUpdate {
  const toolCallId = update.toolCallId as string | undefined;
  const status = (update.status as string) ?? 'completed';

  const todoState = extractTodoFromUpdate(update);
  const backgroundProcess = parseBackgroundProcessFromToolUpdate(update);

  return { toolCallId, status, todoState, backgroundProcess, content: extractToolContent(update) };
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

/** Parse Hermes' authoritative compression counter from ACP update metadata. */
export function parseCompressionCount(update: RawUpdate): number | undefined {
  const meta = update['_meta'];
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined;
  const hermes = (meta as Record<string, unknown>).hermes;
  if (!hermes || typeof hermes !== 'object' || Array.isArray(hermes)) return undefined;
  const hermesMeta = hermes as Record<string, unknown>;
  const provenance = hermesMeta.sessionProvenance;
  const provenanceRecord = provenance && typeof provenance === 'object' && !Array.isArray(provenance)
    ? provenance as Record<string, unknown>
    : undefined;
  const raw = hermesMeta.compressionCount
    ?? hermesMeta.compression_count
    ?? provenanceRecord?.compressionDepth
    ?? provenanceRecord?.compression_depth;
  return Number.isSafeInteger(raw) && (raw as number) >= 0 ? raw as number : undefined;
}

// ── Session info parsing ─────────────────────────────

/** Extract session title from a session_info_update. */
export function parseSessionInfoUpdate(update: RawUpdate): string | null {
  const title = update.title as string | undefined;
  return title?.trim() || null;
}

/**
 * Read ACP's native plan update into todo items.
 *
 * Hermes emits `sessionUpdate: "plan"` whenever its todo tool runs
 * (`acp_adapter/events.py`), which is the first-class channel Zed renders as a
 * task panel. Returns null when the update is not a plan, and an empty array
 * for a plan with no entries, so the caller can clear rather than render an
 * empty block.
 */
export function parsePlanUpdate(update: RawUpdate): TodoItem[] | null {
  if (update.sessionUpdate !== 'plan') return null;

  const entries = update.entries;
  if (!Array.isArray(entries)) return null;

  return entries.map(entry => {
    const raw = entry as { content?: unknown; status?: unknown };
    const status = String(raw.status ?? '');
    return {
      content: String(raw.content ?? ''),
      // An unrecognised status still describes a real step, so it is kept as
      // pending rather than dropped.
      status: PLAN_STATUS.includes(status as TodoItem['status'])
        ? (status as TodoItem['status'])
        : 'pending',
    };
  });
}

const PLAN_STATUS: TodoItem['status'][] = ['pending', 'in_progress', 'completed', 'cancelled'];
