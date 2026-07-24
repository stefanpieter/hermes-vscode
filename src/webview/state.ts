/**
 * Webview shared state — replaces scattered mutable globals.
 * All modules import and mutate this single object.
 */

import type { QueuedWebviewMessage } from '../webviewQueue';

export interface WebviewState {
  currentModel: string;
  currentActiveSessionId: string;
  isBusy: boolean;
  knownContextSize: number;

  // Streaming state
  currentAgentEl: HTMLElement | null;
  currentAgentText: string;
  thinkingStatusEl: HTMLElement | null;
  pendingText: string;
  flushScheduled: boolean;
  markdownDebounceTimer: ReturnType<typeof setTimeout> | null;

  /** True when the next agent 'done' is the response to a slash command —
   *  the response bubble should be styled as a system message, not an agent turn. */
  pendingSlashResponse: boolean;

  // Queue
  queueHydrated: boolean;
  pendingQueuedMessages: QueuedWebviewMessage[];
  editingQueuedRequestId?: string;
  prevQueueCount: number;

  // Profiles
  currentProfile: string;
  profileRestartRequired: boolean;

  // Skills
  selectedSkillNames: Set<string>;
  skillGroupsData: { category: string; skills: { name: string; description: string }[] }[];
}

export function createInitialState(): WebviewState {
  return {
    currentModel: '',
    currentActiveSessionId: '',
    isBusy: false,
    knownContextSize: 0,
    currentAgentEl: null,
    currentAgentText: '',
    thinkingStatusEl: null,
    pendingText: '',
    flushScheduled: false,
    markdownDebounceTimer: null,
    pendingSlashResponse: false,
    queueHydrated: false,
    pendingQueuedMessages: [],
    prevQueueCount: 0,
    currentProfile: '',
    profileRestartRequired: false,
    selectedSkillNames: new Set(),
    skillGroupsData: [],
  };
}
