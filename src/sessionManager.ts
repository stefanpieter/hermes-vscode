/**
 * Manages a single active ACP session.
 *
 * ACP method names (v1 protocol):
 *   session/new     — create session, returns { sessionId, models?, ... }
 *   session/prompt  — send message, blocks until done, params { sessionId, prompt: [...] }
 *   session/cancel  — abort (notification, no response), params { sessionId }
 *
 * Incoming notifications from agent:
 *   session/update  — { sessionId, update: { sessionUpdate, ... } }
 *     update kinds handled:
 *       agent_message_chunk  — streaming text delta
 *       agent_thought_chunk  — thinking text
 *       tool_call            — tool progress
 *       usage_update         — context used/size tokens
 *       session_info_update  — session title
 *
 * Incoming requests from agent:
 *   session/request_permission — auto-approved with allow_once
 *
 * Deduplication:
 *   Hermes ACP sends text as streaming deltas AND then resends the full
 *   accumulated text at the end as a reliability fallback. We track the
 *   accumulated text and drop the final repeated message.
 */

import { AcpClient } from './acpClient';
import { EditApprovalModeId, normalizeEditApprovalMode } from './editApprovalMode';
import type { SessionUpdateEvent, SessionUpdateHandler } from './types';
import {
  extractTextContent, deduplicateChunk,
  parseToolCall, parseToolCallUpdate,
  parseUsageUpdate, parseSessionInfoUpdate, parseBackgroundProcessMeta,
} from './protocol';

export type PermissionRequestHandler = (method: string, params: unknown) => Promise<unknown>;

interface PromptTurn {
  id: number;
  sessionId: string | null;
  cancelled: boolean;
  promptActive: boolean;
}

export class SessionManager {
  private sessionId: string | null = null;
  private updateHandler: SessionUpdateHandler | null = null;

  /** Accumulated streaming text for the current turn (used for dedup). */
  private accumulated = '';

  /** Cancellation ownership for the one active turn, including session binding. */
  private activePromptTurn: PromptTurn | null = null;
  private nextPromptTurnId = 1;

  /** True while session/load is synchronously replaying persisted history. */
  private replayActive = false;

  /** Preferred ACP edit mode, reapplied whenever a session is created or loaded. */
  private editApprovalMode: EditApprovalModeId;

  constructor(
    private readonly client: AcpClient,
    private readonly log: (line: string) => void = () => {},
    private readonly permissionRequestHandler?: PermissionRequestHandler,
    initialEditApprovalMode: EditApprovalModeId = 'default',
  ) {
    this.editApprovalMode = normalizeEditApprovalMode(initialEditApprovalMode);
    client.onNotification((method, params) => {
      if (method === 'session/update') {
        this.handleUpdate(params as Record<string, unknown>);
      }
    });

    client.onIncomingRequest(async (method, _params) => {
      if (method === 'session/request_permission') {
        if (!this.permissionRequestHandler) {
          throw new Error('Permission denied: no approval handler registered');
        }
        return this.permissionRequestHandler(method, _params);
      }
      throw new Error(`Unhandled client method: ${method}`);
    });
  }

  onUpdate(handler: SessionUpdateHandler): void {
    this.updateHandler = handler;
  }

  /** Set a stored ACP session ID for resume attempts. */
  setStoredSessionId(id: string | undefined): void {
    this.storedSessionId = id ?? null;
  }
  private storedSessionId: string | null = null;

  /** Returns the current ACP session ID (for persistence by the caller). */
  getSessionId(): string | null {
    return this.sessionId;
  }

  getEditApprovalMode(): EditApprovalModeId {
    return this.editApprovalMode;
  }

  async setEditApprovalMode(mode: EditApprovalModeId, cwd: string): Promise<void> {
    const previousMode = this.editApprovalMode;
    this.editApprovalMode = normalizeEditApprovalMode(mode);
    try {
      if (!this.sessionId) {
        await this.ensureSession(cwd);
        return;
      }
      await this.applyEditApprovalMode(this.sessionId);
    } catch (err) {
      this.editApprovalMode = previousMode;
      throw err;
    }
  }

  private async applyEditApprovalMode(sessionId: string): Promise<void> {
    await this.client.call('session/set_mode', {
      sessionId,
      modeId: this.editApprovalMode,
    });
    this.log(`[session] edit approval mode ${this.editApprovalMode}`);
  }

  async ensureSession(cwd: string): Promise<string> {
    if (this.sessionId) {
      this.log(`[session] reusing ${this.sessionId}`);
      return this.sessionId;
    }

    // Try to resume a stored session first.
    // Critical: we MUST call session/load so the adapter registers our session ID
    // in its in-memory map. Just assuming the ID is live (previous bug) creates a
    // phantom session that silently fails on subsequent session/prompt calls.
    if (this.storedSessionId) {
      const storedId = this.storedSessionId;
      this.storedSessionId = null;
      let loaded = false;
      try {
        this.log(`[session] attempting session/load ${storedId}`);
        // ACP requires history replay notifications before session/load returns.
        // Route those updates to the pending stored session, but keep them out
        // of the post-prompt background-notification path.
        this.sessionId = storedId;
        this.replayActive = true;
        const result = await this.client.call('session/load', {
          sessionId: storedId,
          cwd,
          mcpServers: [],
        });
        // Adapter returns null when session not found — load_session() → None
        if (result !== null && result !== undefined) {
          loaded = true;
          this.log(`[session] resumed ${storedId}`);
        } else {
          this.sessionId = null;
          this.log(`[session] stored session ${storedId} not found on adapter, creating new`);
        }
      } catch (err) {
        this.sessionId = null;
        this.log(`[session] session/load failed (${err}), creating new`);
      } finally {
        this.replayActive = false;
      }
      if (loaded) {
        await this.applyEditApprovalMode(storedId);
        return storedId;
      }
      // Fall through to session/new
    }

    this.log(`[session] creating new session for cwd=${cwd}`);

    const result = (await this.client.call('session/new', {
      cwd,
      mcpServers: [],
    })) as { sessionId: string; models?: { currentModelId?: string } };

    this.sessionId = result.sessionId;
    this.log(`[session] created ${this.sessionId}`);
    await this.applyEditApprovalMode(this.sessionId);

    // Emit initial model from session/new response
    const model = result.models?.currentModelId;
    if (model && this.updateHandler) {
      this.updateHandler({ session_id: this.sessionId, model });
    }

    return this.sessionId;
  }

  async sendPrompt(
    text: string,
    cwd: string,
    onSessionBound?: (sessionId: string) => void,
  ): Promise<void> {
    if (this.activePromptTurn) throw new Error('Prompt already active');
    const turn: PromptTurn = {
      id: this.nextPromptTurnId++,
      sessionId: null,
      cancelled: false,
      promptActive: false,
    };
    this.activePromptTurn = turn;
    this.accumulated = '';

    try {
      const sessionId = await this.ensureSession(cwd);
      turn.sessionId = sessionId;
      onSessionBound?.(sessionId);
      if (turn.cancelled) throw new Error('Cancelled');
      this.log(`[session] prompt ${sessionId} (${text.length} chars)`);

      let promptResponse: Record<string, unknown> = {};
      turn.promptActive = true;
      try {
        const result = await this.client.call('session/prompt', {
          sessionId,
          prompt: [{ type: 'text', text }],
        });
        promptResponse = (result as Record<string, unknown>) ?? {};
      } catch (err) {
        if (turn.cancelled) throw new Error('Cancelled');
        throw err;
      }
      // A cancellation is complete only when the matching ACP request reaches a
      // terminal response. This barrier prevents the caller from draining its
      // next queued turn while the cancelled request is still live remotely.
      if (turn.cancelled) throw new Error('Cancelled');

      // Extract current context usage from PromptResponse.
      // usage.inputTokens = last_prompt_tokens (total sent to API including cached).
      // usage.cachedReadTokens = portion served from Anthropic prompt cache (90% cheaper).
      // _meta.contextLength = model context window size (for progress bar).
      const usage = promptResponse.usage as Record<string, unknown> | undefined;
      const meta = promptResponse['_meta'] as Record<string, unknown> | undefined;
      const inputTokens = typeof usage?.inputTokens === 'number' ? usage.inputTokens as number : 0;
      const cachedTokens = typeof usage?.cachedReadTokens === 'number' ? usage.cachedReadTokens as number : 0;
      // contextUsed shows total (matches what the model "sees"), but we also emit cached for the UI.
      const contextUsed: number | undefined = inputTokens > 0 ? inputTokens : undefined;
      const contextSize: number | undefined = (
        typeof meta?.contextLength === 'number' && meta.contextLength > 0 ? meta.contextLength as number :
        undefined
      );
      this.log(`[session] prompt done ${sessionId}${contextUsed ? ` used=${contextUsed}` : ''}${cachedTokens ? ` cached=${cachedTokens}` : ''}${contextSize ? ` size=${contextSize}` : ''}`);
      this.updateHandler?.({ session_id: sessionId, done: true, contextUsed, contextSize, cachedTokens });
    } finally {
      if (this.activePromptTurn === turn) this.activePromptTurn = null;
    }
  }

  async cancel(): Promise<void> {
    const turn = this.activePromptTurn;
    if (!turn) {
      this.log('[session] cancel requested with no active turn');
      return;
    }
    this.log(`[session] cancel requested turn ${turn.id}`);
    turn.cancelled = true;
    if (!turn.promptActive || !turn.sessionId) return;
    // session/cancel is a notification in ACP — no id, no response expected.
    // Binding-only cancellation is local because no session/prompt exists yet.
    // Once prompting starts, sendPrompt remains pending until that call terminates.
    this.client.notify('session/cancel', { sessionId: turn.sessionId });
  }

  reset(): void {
    this.log('[session] reset');
    this.sessionId = null;
    this.storedSessionId = null;
    this.accumulated = '';
  }

  private handleUpdate(params: Record<string, unknown>): void {
    if (!this.updateHandler) return;

    const session_id = params.sessionId as string;
    const update = params.update as Record<string, unknown> | undefined;
    if (!session_id || !update) return;
    if (session_id !== this.sessionId) {
      const meta = update['_meta'] as Record<string, unknown> | undefined;
      const hermesMeta = meta?.hermes as Record<string, unknown> | undefined;
      if (hermesMeta?.backgroundNotification !== true) {
        this.log(`[session] ignored update for inactive session ${session_id}`);
        return;
      }
    }

    const kind = update.sessionUpdate as string;
    const event: SessionUpdateEvent = { session_id };

    switch (kind) {
      case 'agent_message_chunk': {
        if (this.activePromptTurn?.cancelled) return;
        const text = extractTextContent(update);
        if (text === null) return;
        const meta = update['_meta'] as Record<string, unknown> | undefined;
        const hermesMeta = meta?.hermes as Record<string, unknown> | undefined;
        const isBackground = hermesMeta?.backgroundNotification === true
          || (!(this.activePromptTurn?.promptActive ?? false) && !this.replayActive);
        event.background = isBackground;
        event.backgroundProcess = parseBackgroundProcessMeta(update);
        if (isBackground) {
          event.text = text;
          break;
        }
        const result = deduplicateChunk(text, this.accumulated);
        if (result.action === 'drop') {
          if (this.accumulated.endsWith(text)) {
            this.log(`[session] dedup: dropped partial resend (${text.length} chars)`);
          }
          return;
        }
        this.accumulated = result.newAccumulated;
        event.text = result.text;
        break;
      }

      case 'agent_thought_chunk': {
        if (this.activePromptTurn?.cancelled) return;
        const text = extractTextContent(update);
        if (text?.trim()) event.thinkingText = text;
        else return;
        break;
      }

      case 'tool_call': {
        if (this.activePromptTurn?.cancelled) return;
        const parsed = parseToolCall(update);
        event.toolTitle = parsed.title;
        event.toolStatus = parsed.status;
        event.toolCallId = parsed.toolCallId;
        event.toolKind = parsed.kind;
        if (parsed.locations.length) event.toolLocations = parsed.locations;
        if (parsed.detail) event.toolDetail = parsed.detail;
        if (parsed.todoState) {
          event.todoState = parsed.todoState;
          this.log(`[session] todo tool_call: ${parsed.todoState.todos.length} items`);
        }
        break;
      }

      case 'tool_call_update': {
        if (this.activePromptTurn?.cancelled) return;
        const parsed = parseToolCallUpdate(update);
        event.toolCallId = parsed.toolCallId;
        event.toolStatus = parsed.status;
        event.toolTitle = ''; // signal: update, not new call
        if (parsed.backgroundProcess) event.backgroundProcess = parsed.backgroundProcess;
        if (parsed.todoState) {
          event.todoState = parsed.todoState;
          this.log(`[session] todo update: ${parsed.todoState.todos.length} items`);
        }
        break;
      }

      case 'usage_update': {
        const usage = parseUsageUpdate(update);
        if (!usage) return;
        event.contextUsed = usage.contextUsed;
        event.contextSize = usage.contextSize;
        break;
      }

      case 'session_info_update': {
        const title = parseSessionInfoUpdate(update);
        if (!title) return;
        event.sessionTitle = title;
        break;
      }

      default:
        return;
    }

    this.updateHandler(event);
  }
}
