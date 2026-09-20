/**
 * Shared type definitions for the Hermes VS Code extension.
 * Used by both the extension host (Node.js) and webview (browser).
 */

import type { SkillGroup } from './skillCatalog';
import type { AcpModelState, ModelMenuGroup } from './modelCatalog';
import type { EditApprovalModeOption } from './editApprovalMode';
import type { MentionSuggestion } from './mentions';
import type { AcpModeState } from './modeCatalog';
import type { ProfileMenuItem } from './profileUi';
import type { QueuedWebviewMessage } from './webviewQueue';
import type { AgentActivity } from './agentActivity';
import type { AvailableSlashCommand } from './slashCommands';

// ── Session & History ────────────────────────────────

export interface StoredMessage {
  role: 'user' | 'agent' | 'tool' | 'error';
  text: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  messages: StoredMessage[];
  acpSessionId?: string;
}

// ── Todo ─────────────────────────────────────────────

export interface TodoItem {
  id?: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  activeForm?: string;
}

export interface TodoState {
  todos: TodoItem[];
  summary?: {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    cancelled: number;
  };
}

// ── ACP Session Events ───────────────────────────────

export interface BackgroundProcessState {
  id: string;
  status: 'running' | 'completed' | 'failed';
  exitCode?: number;
}

export interface DelegationRegistration {
  delegationId: string;
  transcriptPaths: string[];
}

export interface AutonomousTurnState {
  id: string;
  status: 'running' | 'completed' | 'failed';
  trigger: 'background_notification';
}

export interface SessionUpdateEvent {
  session_id: string;
  runtimeGeneration?: number;
  text?: string;
  replay?: boolean;
  background?: boolean;
  backgroundProcess?: BackgroundProcessState;
  autonomousTurn?: AutonomousTurnState;
  autonomousTurnId?: string;
  thinkingText?: string;
  toolTitle?: string;
  toolStatus?: string;
  toolCallId?: string;
  toolDetail?: string;
  /** Formatted tool output: results, diffs, command text. */
  toolContent?: string;
  toolKind?: string;
  toolLocations?: string[];
  /** Line each tool location points at, index-aligned with toolLocations. */
  toolLocationLines?: (number | undefined)[];
  todoState?: TodoState;
  done?: boolean;
  error?: string;
  model?: string;
  /** ACP SessionModelState: the authenticated inventory plus the current id. */
  modelState?: AcpModelState;
  /** ACP SessionModeState: the advertised edit-approval modes. */
  modeState?: AcpModeState;
  sessionTitle?: string;
  contextUsed?: number;
  contextSize?: number;
  cachedTokens?: number;
  /** A user message the agent echoed back, e.g. a drained queued prompt. */
  userEcho?: string;
  compressionCount?: number;
  availableCommands?: AvailableSlashCommand[];
  agentActivities?: AgentActivity[];
  delegationRegistration?: DelegationRegistration;
}

export type SessionUpdateHandler = (event: SessionUpdateEvent) => void;

// ── Webview Messages ─────────────────────────────────

export interface ToWebview {
  type:
    | 'append' | 'backgroundNotification' | 'thinking' | 'toolCall' | 'done'
    | 'error' | 'status' | 'notice' | 'clear' | 'busy' | 'queueState'
    | 'statusBar' | 'sessionList' | 'loadHistory' | 'profileList' | 'modelGroups'
    | 'mentionSuggestions' | 'modeState' | 'userEcho';
  text?: string;
  toolName?: string;
  toolStatus?: string;
  toolCallId?: string;
  toolDetail?: string;
  /** Formatted tool output: results, diffs, command text. */
  toolContent?: string;
  toolKind?: string;
  toolLocations?: string[];
  /** Line each tool location points at, index-aligned with toolLocations. */
  toolLocationLines?: (number | undefined)[];
  todoState?: TodoState;
  backgroundProcesses?: BackgroundProcessState[];
  modelGroups?: ModelMenuGroup[];
  /** Candidate files for the composer's `@` picker. */
  mentionSuggestions?: MentionSuggestion[];
  /** Query these suggestions answer, so a stale reply can be discarded. */
  query?: string;
  /** Edit-approval modes the agent advertised, for the composer selector. */
  modeOptions?: readonly EditApprovalModeOption[];
  /** Currently selected edit-approval mode id. */
  activeMode?: string;
  status?: string;
  active?: boolean;
  queued?: number;
  queuedItems?: QueuedWebviewMessage[];
  startedText?: string;
  startedSlashCommand?: boolean;
  startedRequestId?: string;
  activeSlashCommand?: boolean;
  model?: string;
  sessionTitle?: string;
  contextUsed?: number;
  contextSize?: number;
  cachedTokens?: number;
  compressionCount?: number;
  version?: string;
  sessions?: ChatSession[];
  activeSessionId?: string;
  history?: StoredMessage[];
  switched?: boolean;
  attachedFiles?: { name: string; path: string }[];
  selectedSkills?: string[];
  skillGroups?: SkillGroup[];
  contextAnnotation?: string;
  profile?: string;
  profiles?: string[];
  profileItems?: ProfileMenuItem[];
  restartRequired?: boolean;
  availableCommands?: AvailableSlashCommand[];
  agentActivities?: AgentActivity[];
}

export interface FromWebview {
  type:
    | 'ready' | 'send' | 'editQueuedMessage' | 'deleteQueuedMessage' | 'switchModel' | 'cancel'
    | 'newSession' | 'switchSession'
    | 'attachFile' | 'pasteImage' | 'dropFiles' | 'clearAttachments'
    | 'toggleSkill' | 'renameSession' | 'deleteSession'
    | 'selectProfile' | 'customProfile' | 'restartHermes' | 'requestCommands'
    | 'mentionQuery' | 'setMode';
  text?: string;
  requestId?: string;
  sessionId?: string;
  model?: string;
  data?: string;
  ext?: string;
  uris?: string[];
  /** Text typed after `@`, sent as the composer's mention query. */
  query?: string;
}

// ── Attachment ───────────────────────────────────────

export interface AttachedFile {
  name: string;
  path: string;
}
