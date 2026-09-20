/**
 * Webview entry point — thin wiring layer.
 * Imports modules, grabs DOM refs, connects event handlers.
 */

import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { ToWebview, FromWebview, TodoItem } from '../types';
import { createInitialState } from './state';
import {
  acknowledgeStartedQueuedMessage,
  createComposerRequestId,
  editQueuedMessage,
  hydrateWebviewQueueState,
  registerSubmittedWebviewMessage,
} from '../webviewQueue';
import { isKnownSlashCommand } from '../slashCommands';
import { primaryAgentActivity, shouldPulseComposer } from '../agentActivity';
import { renderQueuedMessagesMarkup } from './queueControls';
import {
  renderMarkdown, appendDiv, appendMessage, showWaiting,
  formatToolDisplay, detectTodoUpdate,
  loadHistory, fmtTok,
} from './renderers';
import { renderModelMenu } from '../modelMenu';
import { findMentionQuery, splitMentionQuery } from '../mentions';
import type { MentionSuggestion } from '../mentions';
import { applyMentionCompletion, moveMentionSelection, renderMentionOptions } from '../mentionPicker';
import { findSlashQuery, matchSlashCommands } from '../slashPicker';
import { renderPlanBlock } from '../planBlock';
import { renderModeMenu, modeButtonLabel } from '../modeMenu';
import { toolDensity, renderToolCard } from '../toolCard';
import { isToolFailure } from '../protocol';
import type { EditApprovalModeOption } from '../editApprovalMode';
import {
  closeAllDropdowns, buildSessionPicker, setupSessionPickerHandlers,
  buildProfileMenu, setupProfileHandlers,
  buildSkillsMenu, setupSkillsHandlers, updateStatusBar,
  buildSlashCommandMenu, renderAgentActivityBar,
} from './menus';

declare function acquireVsCodeApi(): { postMessage(msg: FromWebview): void };
const vscode = acquireVsCodeApi();
marked.setOptions({ breaks: true, gfm: true });

// ── State ────────────────────────────────────────────
const S = createInitialState();

// ── DOM refs ─────────────────────────────────────────
const messagesEl       = document.getElementById('messages')!;
const inputEl          = document.getElementById('input') as HTMLTextAreaElement;
const attachBtn        = document.getElementById('attach-btn') as HTMLButtonElement;
const attachChip       = document.getElementById('attach-chip') as HTMLDivElement;
const sendBtn          = document.getElementById('send-btn') as HTMLButtonElement;
const busyBtns         = document.getElementById('busy-btns') as HTMLDivElement;
const stopBtn          = document.getElementById('stop-btn') as HTMLButtonElement;
const queueBtn         = document.getElementById('queue-btn') as HTMLButtonElement;
const queueStatus      = document.getElementById('queue-status') as HTMLDivElement;
const queueItems       = document.getElementById('queue-items') as HTMLDivElement;
const dragHandle       = document.getElementById('input-drag') as HTMLDivElement;
const inputRow         = document.getElementById('input-row') as HTMLDivElement;
const composer         = document.getElementById('composer') as HTMLDivElement;
const mentionMenu      = document.getElementById('mention-menu') as HTMLDivElement;
const modeBtn          = document.getElementById('mode-btn') as HTMLButtonElement;
const modeBtnLabel     = document.getElementById('mode-btn-label')!;
const modeMenu         = document.getElementById('mode-menu') as HTMLDivElement;
const statusSessionEl  = document.getElementById('status-session') as HTMLButtonElement;
const statusContextEl  = document.getElementById('status-context')!;
const statusVersionEl  = document.getElementById('status-version')!;
const ctxBarWrap       = document.getElementById('ctx-bar-wrap') as HTMLDivElement;
const ctxBar           = document.getElementById('ctx-bar') as HTMLDivElement;
const ctxBarFresh      = document.getElementById('ctx-bar-fresh') as HTMLDivElement;
const modelBtnHeader   = document.getElementById('model-btn-header') as HTMLButtonElement;
const modelMenu        = document.getElementById('model-menu') as HTMLDivElement;
const profileBtnHeader = document.getElementById('profile-btn-header') as HTMLButtonElement;
const profileLabelEl   = document.getElementById('profile-label') as HTMLSpanElement;
const profileMenu      = document.getElementById('profile-menu') as HTMLDivElement;
const overflowBtn      = document.getElementById('overflow-btn') as HTMLButtonElement;
const overflowMenu     = document.getElementById('overflow-menu') as HTMLDivElement;
const emptyState       = document.getElementById('empty-state') as HTMLDivElement;
const sessionPicker    = document.getElementById('session-picker') as HTMLDivElement;
const logoMark         = document.getElementById('logo-mark')!;
const backgroundProcessStatus = document.getElementById('background-process-status')!;
const skillsBtn        = document.getElementById('skills-btn') as HTMLButtonElement;
const skillsMenu       = document.getElementById('skills-menu') as HTMLDivElement;
const cmdArgPopover    = document.getElementById('cmd-arg-popover') as HTMLDivElement;
const cmdArgInput      = document.getElementById('cmd-arg-input') as HTMLInputElement;
const cmdArgLabel      = document.getElementById('cmd-arg-label') as HTMLElement;
const agentActivityBar = document.getElementById('agent-activity-bar') as HTMLDivElement;

// The host owns the live queue across webview disposal. Keep submission controls
// unavailable until the ready handshake restores that runtime state.
inputEl.disabled = true;
sendBtn.disabled = true;
queueBtn.disabled = true;

const dropdownEls = { modelMenu, sessionPicker, skillsMenu, overflowMenu, profileMenu, cmdArgPopover, modeMenu };
const statusEls = { statusVersionEl, modelBtnHeader, modelMenu, statusSessionEl, statusContextEl, ctxBarWrap, ctxBar, ctxBarFresh };
const closeFn = () => closeAllDropdowns(dropdownEls);

function renderAgentBar(): void {
  renderAgentActivityBar(
    agentActivityBar,
    primaryAgentActivity(
      S.isBusy,
      S.currentContextUsed,
      S.knownContextSize || undefined,
      S.currentCompressionCount,
    ),
    S.agentActivities,
  );
  composer.classList.toggle('busy-glow', shouldPulseComposer(S.isBusy, S.agentActivities));
}

// ── Helpers ──────────────────────────────────────────
function setBusy(active: boolean, queued = 0): void {
  S.isBusy = active;
  renderAgentBar();
  logoMark.classList.toggle('busy', active);
  sendBtn.style.display = active ? 'none' : 'block';
  busyBtns.style.display = active ? 'flex' : 'none';
  if (queued > 0) {
    queueStatus.style.display = 'block';
    queueStatus.textContent = `${queued} queued`;
  } else {
    queueStatus.style.display = 'none';
    queueStatus.textContent = '';
  }
  renderQueuedMessages();
  requestAnimationFrame(syncComposerHeight);
}

function renderQueuedMessages(): void {
  queueItems.innerHTML = DOMPurify.sanitize(renderQueuedMessagesMarkup(
    S.pendingQueuedMessages,
    S.editingQueuedRequestId,
  ));
  queueItems.style.display = S.pendingQueuedMessages.length > 0 ? 'flex' : 'none';
  if (S.editingQueuedRequestId) {
    const editor = queueItems.querySelector<HTMLTextAreaElement>('.queued-edit-input');
    editor?.focus();
    editor?.setSelectionRange(editor.value.length, editor.value.length);
  }
}

function syncComposerHeight(): void {
  const target = Math.max(44, inputRow.offsetHeight - 10);
  inputEl.style.height = `${target}px`;
}

// Smart scroll — only auto-scroll if the user is near the bottom of the
// messages pane. If they've scrolled up to read earlier content, don't
// yank them back down. Threshold: within 80px of the bottom.
function shouldAutoScroll(): boolean {
  const el = messagesEl;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}
function autoScroll(): void {
  if (shouldAutoScroll()) messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
}

// Render markdown on a short interval (200ms). Each flush accumulates text
// and schedules a render — the timer coalesces bursts of chunks so we don't
// call marked.parse() on every single token, but still render frequently
// enough to avoid the "plaintext then jump to formatted" flash.
function scheduleMarkdownRender(): void {
  if (S.markdownDebounceTimer) return; // already scheduled
  S.markdownDebounceTimer = setTimeout(() => {
    S.markdownDebounceTimer = null;
    if (S.currentAgentEl && S.currentAgentText) {
      renderMarkdown(S.currentAgentEl, S.currentAgentText);
      autoScroll();
    }
  }, 200);
}

function flushPending(): void {
  if (!S.pendingText) { S.flushScheduled = false; return; }
  if (!S.currentAgentEl) {
    document.getElementById('turn-thinking')?.remove();
    document.getElementById('waiting')?.remove();
    S.currentAgentEl = appendDiv(messagesEl, 'msg agent');
  }
  S.currentAgentText += S.pendingText;
  S.pendingText = ''; S.flushScheduled = false;
  // Render markdown directly — no intermediate .textContent flash.
  // scheduleMarkdownRender coalesces at 100ms so rapid chunks don't
  // each trigger a full marked.parse() + innerHTML replacement.
  scheduleMarkdownRender();
}

function scheduleFlush(): void {
  if (!S.flushScheduled) { S.flushScheduled = true; setTimeout(flushPending, 0); }
}

// ── Send ─────────────────────────────────────────────
function send(): void {
  if (!S.queueHydrated) return;
  const text = inputEl.value.trim();
  if (!text) return;
  const requestId = createComposerRequestId(() => crypto.randomUUID());
  const isSlash = isKnownSlashCommand(text, S.availableCommands);
  registerSubmittedWebviewMessage(S, { requestId, text, isSlashCommand: isSlash });
  inputEl.value = '';
  inputEl.style.height = '';
  attachChip.style.display = 'none'; attachChip.innerHTML = '';
  S.selectedSkillNames.clear();
  skillsBtn.classList.remove('has-skills'); skillsBtn.textContent = '✦';
  if (emptyState) emptyState.style.display = 'none';
  // Rendering waits for the host's started/queued acknowledgement. The local
  // descriptor remains pending so neither direction of a busy-state race can
  // create a duplicate bubble or expose the wrong queue item.
  setBusy(true, S.prevQueueCount);
  vscode.postMessage({ type: 'send', text, requestId });
  requestAnimationFrame(syncComposerHeight);
}

/** Route every slash/menu action through the same queue-aware send path. */
function sendText(text: string): void {
  inputEl.value = text;
  send();
}

// ── Event wiring ─────────────────────────────────────

// Drag handle
let dragActive = false, dragStartY = 0, dragStartH = 0;
dragHandle.addEventListener('mousedown', (e) => {
  dragActive = true; dragStartY = e.clientY; dragStartH = inputEl.offsetHeight;
  document.body.style.userSelect = 'none'; e.preventDefault();
});
document.addEventListener('mousemove', (e) => {
  if (!dragActive) return;
  inputEl.style.height = `${Math.max(44, Math.min(400, dragStartH + (dragStartY - e.clientY)))}px`;
});
document.addEventListener('mouseup', () => {
  if (dragActive) { dragActive = false; document.body.style.userSelect = ''; }
});

// Session picker
statusSessionEl.addEventListener('click', (e) => {
  e.stopPropagation(); const open = sessionPicker.style.display !== 'none';
  closeFn(); if (!open) sessionPicker.style.display = 'block';
});
setupSessionPickerHandlers(sessionPicker, vscode, S, closeFn);

// Model switcher
modelBtnHeader.addEventListener('click', (e) => {
  e.stopPropagation(); const open = modelMenu.style.display !== 'none';
  closeFn(); if (!open) modelMenu.style.display = 'block';
});
modelMenu.addEventListener('click', (e) => {
  const opt = (e.target as HTMLElement).closest<HTMLElement>('.model-option');
  if (!opt?.dataset.command) return;
  closeFn(); vscode.postMessage({ type: 'switchModel', model: opt.dataset.command });
});

// Profile switcher
profileBtnHeader.addEventListener('click', (e) => {
  e.stopPropagation(); const open = profileMenu.style.display !== 'none';
  closeFn(); if (!open) profileMenu.style.display = 'block';
});
setupProfileHandlers(profileMenu, vscode, closeFn);

// Slash-command menu (hybrid dispatch: execute / confirm / prompt-for-arg)
function hideCmdArg(): void {
  cmdArgPopover.style.display = 'none';
  cmdArgInput.value = '';
  cmdArgInput.onkeydown = null;
}

function promptForArg(cmd: string, label: string): void {
  cmdArgLabel.textContent = label;
  cmdArgInput.value = '';
  cmdArgPopover.style.display = 'block';
  setTimeout(() => cmdArgInput.focus(), 0);
  cmdArgInput.onkeydown = (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      const arg = cmdArgInput.value.trim();
      hideCmdArg();
      if (arg) sendText(`${cmd} ${arg}`);
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      hideCmdArg();
    }
  };
}

overflowBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = overflowMenu.style.display !== 'none';
  closeFn(); hideCmdArg();
  if (!open) {
    buildSlashCommandMenu(overflowMenu, S.availableCommands);
    overflowMenu.style.display = 'block';
  }
});

overflowMenu.addEventListener('click', (e) => {
  const item = (e.target as HTMLElement).closest<HTMLElement>('.menu-item[data-cmd]');
  if (!item?.dataset.cmd) return;
  e.stopPropagation();
  const cmd  = item.dataset.cmd;
  const mode = item.dataset.mode ?? 'execute';
  closeFn();

  if (mode === 'execute') {
    sendText(cmd);
  } else if (mode === 'confirm') {
    const msg = item.dataset.confirm ?? `Run ${cmd}?`;
    // eslint-disable-next-line no-alert
    if (confirm(msg)) sendText(cmd);
  } else if (mode === 'prompt') {
    promptForArg(cmd, item.dataset.argLabel ?? 'Argument');
  }
});

// Empty state prompt chips — send immediately on click
emptyState?.addEventListener('click', (e) => {
  const chip = (e.target as HTMLElement).closest<HTMLElement>('.prompt-chip');
  if (!chip?.dataset.prompt) return;
  inputEl.value = chip.dataset.prompt;
  send();
});

// File attachment
attachBtn.addEventListener('click', () => vscode.postMessage({ type: 'attachFile' }));
attachChip.addEventListener('click', (e) => {
  if ((e.target as HTMLElement).classList.contains('chip-x')) {
    attachChip.style.display = 'none'; attachChip.innerHTML = '';
    vscode.postMessage({ type: 'clearAttachments' } as any);
  }
});

// Clipboard paste
document.addEventListener('paste', (e: ClipboardEvent) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.startsWith('image/')) {
      e.preventDefault();
      const blob = items[i].getAsFile();
      if (!blob) return;
      const reader = new FileReader();
      const ext = items[i].type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        vscode.postMessage({ type: 'pasteImage', data: base64, ext } as any);
      };
      reader.readAsDataURL(blob); return;
    }
  }
  const files = e.clipboardData?.files;
  if (files) {
    for (let i = 0; i < files.length; i++) {
      if (files[i].type.startsWith('image/')) {
        e.preventDefault();
        const ext = files[i].type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          vscode.postMessage({ type: 'pasteImage', data: base64, ext } as any);
        };
        reader.readAsDataURL(files[i]); return;
      }
    }
  }
});

// Drag & drop
document.body.addEventListener('dragover', (e) => {
  e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
  messagesEl.style.outline = '2px dashed rgba(245,197,66,0.5)';
  messagesEl.style.outlineOffset = '-4px';
});
document.body.addEventListener('dragleave', () => {
  messagesEl.style.outline = ''; messagesEl.style.outlineOffset = '';
});
document.body.addEventListener('drop', (e) => {
  e.preventDefault();
  messagesEl.style.outline = ''; messagesEl.style.outlineOffset = '';
  const uriList = e.dataTransfer?.getData('text/uri-list');
  if (uriList) {
    const paths = uriList.split('\n').map(u => u.trim()).filter(Boolean);
    if (paths.length > 0) vscode.postMessage({ type: 'dropFiles', uris: paths } as any);
  }
});

// Skills picker
skillsBtn.addEventListener('click', (e) => {
  e.stopPropagation(); const open = skillsMenu.style.display !== 'none';
  closeFn(); if (!open) { buildSkillsMenu(skillsMenu, S); skillsMenu.style.display = 'block'; }
});
setupSkillsHandlers(skillsMenu, skillsBtn, vscode, S);

// Slash commands
document.querySelectorAll<HTMLButtonElement>('.cmd-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const cmd = btn.dataset.cmd; if (!cmd) return;
    sendText(cmd);
  });
});

// Send / stop / queue
stopBtn.addEventListener('click', () => vscode.postMessage({ type: 'cancel' }));
queueBtn.addEventListener('click', send);
sendBtn.addEventListener('click', send);
inputEl.addEventListener('keydown', (e) => {
  // The mention picker owns navigation keys while it is open, so Enter
  // accepts a file instead of sending a half-typed message.
  if (mentionOpen) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      mentionSelected = moveMentionSelection(
        mentionSelected, mentionItems.length, e.key === 'ArrowDown' ? 'down' : 'up');
      paintMentionMenu();
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      acceptMention(mentionItems[mentionSelected]);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMentionMenu();
      return;
    }
  }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});

// ── Mention picker ───────────────────────────────────

let mentionOpen = false;
let mentionItems: MentionSuggestion[] = [];
let mentionSelected = 0;
let mentionStart = 0;
/** Which catalogue the open popup is showing. */
let mentionKind: 'mention' | 'slash' = 'mention';
/** Query the open menu is showing, so a slower reply for an older one is dropped. */
let mentionQuery = '';

function closeMentionMenu(): void {
  mentionOpen = false;
  mentionItems = [];
  mentionSelected = 0;
  mentionMenu.style.display = 'none';
}

function paintMentionMenu(): void {
  if (mentionItems.length === 0) { closeMentionMenu(); return; }
  const hint = mentionKind === 'slash'
    ? '<div class="mention-hint">commands</div>'
    : splitMentionQuery(mentionQuery).kind === 'file'
      ? '<div class="mention-hint">files &middot; type <b>skill:</b> for skills</div>'
      : '<div class="mention-hint">skills</div>';
  mentionMenu.innerHTML = hint + renderMentionOptions(mentionItems, mentionSelected);
  mentionMenu.style.display = 'block';
  mentionMenu.querySelector('.mention-option.active')?.scrollIntoView({ block: 'nearest' });
}

function acceptMention(suggestion: MentionSuggestion | undefined): void {
  if (!suggestion) { closeMentionMenu(); return; }

  if (mentionKind === 'slash') {
    // A slash command is the whole message, so it replaces the text outright
    // rather than splicing into it. The trailing space lets arguments follow.
    inputEl.value = `/${suggestion.mention} `;
    inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length);
    closeMentionMenu();
    inputEl.focus();
    return;
  }

  const applied = applyMentionCompletion({
    text: inputEl.value,
    start: mentionStart,
    caret: inputEl.selectionStart ?? inputEl.value.length,
    mention: suggestion.mention,
  });
  inputEl.value = applied.text;
  inputEl.setSelectionRange(applied.caret, applied.caret);
  closeMentionMenu();
  inputEl.focus();
}

/**
 * Place the plan inline, so it belongs to the turn that produced it and
 * scrolls away with it. The old floating overlay pinned above the composer
 * showed a plan from ten turns ago as if it were still current.
 *
 * One block per turn: an updated plan replaces its own rather than stacking
 * near-identical checklists down the transcript.
 */
function showPlan(todos: TodoItem[]): void {
  const html = renderPlanBlock(todos);
  if (!html) return;
  const last = messagesEl.lastElementChild;
  const host = last?.classList.contains('plan-wrap')
    ? (last as HTMLElement)
    : appendDiv(messagesEl, 'msg plan-wrap');
  host.innerHTML = html;
  autoScroll();
}

// ── Mode selector ────────────────────────────────────

let modeOptions: readonly EditApprovalModeOption[] = [];
let activeModeId = '';

modeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const open = modeMenu.style.display === 'block';
  closeAllDropdowns(dropdownEls);
  if (open) return;
  modeMenu.innerHTML = renderModeMenu(modeOptions, activeModeId);
  modeMenu.style.display = 'block';
});

modeMenu.addEventListener('click', (e) => {
  const option = (e.target as HTMLElement).closest<HTMLElement>('.mode-option');
  const mode = option?.dataset.mode;
  if (!mode) return;
  e.stopPropagation();
  modeMenu.style.display = 'none';
  // The host owns the mode and echoes it back via modeState, so the button
  // reflects what actually took effect rather than what was clicked.
  vscode.postMessage({ type: 'setMode', text: mode });
});

function refreshMentionMenu(): void {
  // A leading `/` opens the command palette; `@` opens files or skills. Both
  // render in the same popup, so only the source of the items differs.
  const slash = findSlashQuery(inputEl.value, inputEl.selectionStart ?? 0);
  if (slash) {
    mentionOpen = true;
    mentionKind = 'slash';
    mentionStart = 0;
    mentionQuery = slash.query;
    mentionItems = matchSlashCommands(S.availableCommands, slash.query);
    mentionSelected = 0;
    paintMentionMenu();
    return;
  }

  const found = findMentionQuery(inputEl.value, inputEl.selectionStart ?? 0);
  if (!found) { closeMentionMenu(); return; }
  mentionOpen = true;
  mentionKind = 'mention';
  mentionStart = found.start;
  mentionQuery = found.query;
  vscode.postMessage({ type: 'mentionQuery', query: found.query });
}

inputEl.addEventListener('input', refreshMentionMenu);
// Clicking or arrowing out of the mention closes it; `input` alone misses that.
inputEl.addEventListener('click', refreshMentionMenu);
inputEl.addEventListener('blur', () => setTimeout(closeMentionMenu, 120));

mentionMenu.addEventListener('mousedown', (e) => {
  // mousedown, not click: blur would close the menu before click landed.
  e.preventDefault();
  const option = (e.target as HTMLElement).closest<HTMLElement>('.mention-option');
  const mention = option?.dataset.mention;
  if (mention) acceptMention(mentionItems.find(item => item.mention === mention));
});

queueItems.addEventListener('click', (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-action]');
  const row = button?.closest<HTMLElement>('.queued-item[data-request-id]');
  const requestId = row?.dataset.requestId;
  const action = button?.dataset.action;
  if (!button || !row || !requestId || !action) return;

  if (action === 'edit') {
    S.editingQueuedRequestId = requestId;
    renderQueuedMessages();
    return;
  }
  if (action === 'cancel') {
    S.editingQueuedRequestId = undefined;
    renderQueuedMessages();
    return;
  }
  if (action === 'delete') {
    // Native browser confirm() dialogs are blocked by VS Code's sandboxed
    // webview. Ask the Extension Host to use VS Code's supported modal UI and
    // wait for its authoritative queueState response before changing the row.
    vscode.postMessage({ type: 'deleteQueuedMessage', requestId });
    return;
  }
  if (action === 'save') {
    const editor = row.querySelector<HTMLTextAreaElement>('.queued-edit-input');
    const text = editor?.value.trim();
    if (!text) {
      editor?.focus();
      return;
    }
    editQueuedMessage(S.pendingQueuedMessages, requestId, text, isKnownSlashCommand(text, S.availableCommands));
    S.editingQueuedRequestId = undefined;
    renderQueuedMessages();
    vscode.postMessage({ type: 'editQueuedMessage', requestId, text });
  }
});

// Close dropdowns on outside click
document.addEventListener('click', closeFn);

// Resize
window.addEventListener('resize', () => requestAnimationFrame(syncComposerHeight));
requestAnimationFrame(syncComposerHeight);

// ── Message handler ──────────────────────────────────
window.addEventListener('message', (e: MessageEvent) => {
  const msg = e.data as ToWebview;

  switch (msg.type) {
    case 'userEcho': {
      // A queued prompt the agent just began answering: render it as a user
      // turn so the reply that follows is not orphaned.
      if (S.pendingText) flushPending();
      appendMessage(messagesEl, 'user', msg.text ?? '');
      autoScroll();
      break;
    }

    case 'append':
      S.pendingText += msg.text ?? '';
      scheduleFlush();
      break;

    case 'backgroundNotification': {
      const notification = appendMessage(messagesEl, 'agent', msg.text ?? '');
      renderMarkdown(notification, msg.text ?? '');
      autoScroll();
      break;
    }

    case 'thinking':
      if (!S.thinkingStatusEl) {
        document.getElementById('waiting')?.remove();
        S.thinkingStatusEl = appendDiv(messagesEl, 'status-line thinking-status');
        S.thinkingStatusEl.id = 'turn-thinking';
      }
      S.thinkingStatusEl.textContent = msg.text ?? '';
      break;

    case 'toolCall': {
      if (!msg.toolName && msg.toolCallId) {
        const existing = document.querySelector(`[data-tool-id="${msg.toolCallId}"]`);
        if (existing) {
          const isDone = msg.toolStatus === 'done' || msg.toolStatus === 'completed';
          const isError = isToolFailure(msg.toolStatus);
          const statusEl = existing.querySelector('.tool-status');
          if (statusEl) {
            statusEl.textContent = isDone ? '✓' : isError ? '✗' : '⋯';
            statusEl.className = `tool-status${isDone ? ' done' : isError ? ' error' : ''}`;
          }
        }
        break;
      }
      if (S.pendingText) flushPending();
      if (S.currentAgentEl && S.currentAgentText) renderMarkdown(S.currentAgentEl, S.currentAgentText);
      S.currentAgentEl = null; S.currentAgentText = '';
      document.getElementById('waiting')?.remove();
      const isDone = msg.toolStatus === 'done' || msg.toolStatus === 'completed';
      const isError = isToolFailure(msg.toolStatus);
      const statusIcon = isDone ? '✓' : isError ? '✗' : '⋯';
      const statusClass = isDone ? ' done' : isError ? ' error' : '';
      const toolEl = appendDiv(messagesEl, 'msg tool');
      if (msg.toolCallId) toolEl.dataset.toolId = msg.toolCallId;
      const { label, info } = formatToolDisplay(msg.toolName ?? '', msg.toolKind, msg.toolLocations, msg.toolDetail);
      const body = msg.toolContent ?? '';

      // Two densities: a call whose output matters gets a card with the
      // content inline; a quick lookup stays a single flat row.
      if (toolDensity({ label, body }) === 'card') {
        toolEl.className = 'msg tool-wrap';
        toolEl.innerHTML = renderToolCard({
          label,
          target: info,
          status: isDone ? '' : (msg.toolStatus ?? ''),
          body,
          state: isError ? 'error' : isDone ? 'done' : 'running',
        });
        toolEl.querySelector('.tool-card-h')?.addEventListener('click', () => {
          toolEl.querySelector('.tool-card')?.classList.toggle('collapsed');
        });
      } else {
        const infoHtml = info ? `<span class="tool-detail">${DOMPurify.sanitize(info)}</span>` : '';
        toolEl.innerHTML = `<span class="tool-status${statusClass}">${statusIcon}</span><span class="tool-name">${label}</span>${infoHtml}`;
      }
      autoScroll();
      break;
    }

    case 'queueState': {
      const active = msg.active ?? false;
      const queued = msg.queued ?? 0;
      hydrateWebviewQueueState(S, {
        active,
        queued,
        activeSlashCommand: msg.activeSlashCommand ?? false,
        queuedItems: msg.queuedItems ?? [],
      });
      S.editingQueuedRequestId = undefined;
      inputEl.disabled = false;
      sendBtn.disabled = false;
      queueBtn.disabled = false;
      setBusy(active, queued);
      inputEl.focus();
      break;
    }

    case 'busy': {
      const newQueued = msg.queued ?? 0;
      if (msg.active && msg.startedText !== undefined && msg.startedSlashCommand !== undefined) {
        const next = acknowledgeStartedQueuedMessage(
          S,
          msg.startedText,
          msg.startedSlashCommand,
          msg.startedRequestId,
        );
        S.currentAgentEl = null; S.currentAgentText = ''; S.thinkingStatusEl = null; S.pendingText = '';
        if (next?.renderUserMessage) {
          appendMessage(messagesEl, 'user', next.text);
        }
        if (next?.showWaiting) showWaiting(messagesEl);
      }
      if (msg.queuedItems !== undefined) {
        S.pendingQueuedMessages = msg.queuedItems.map(message => ({ ...message }));
        if (S.editingQueuedRequestId && !S.pendingQueuedMessages.some(
          message => message.requestId === S.editingQueuedRequestId,
        )) S.editingQueuedRequestId = undefined;
      }
      S.prevQueueCount = newQueued;
      setBusy(msg.active ?? false, newQueued);
      break;
    }

    case 'done':
      if (S.pendingText) flushPending();
      if (S.markdownDebounceTimer) { clearTimeout(S.markdownDebounceTimer); S.markdownDebounceTimer = null; }
      document.getElementById('waiting')?.remove();
      document.getElementById('turn-thinking')?.remove();
      if (S.currentAgentEl && S.currentAgentText) {
        // If this turn was a slash command, restyle the bubble as a centered
        // "system" message instead of a normal agent reply. The content is
        // canned adapter output, not an LLM response — the visual treatment
        // should reflect that.
        if (S.pendingSlashResponse) {
          S.currentAgentEl.classList.remove('agent');
          S.currentAgentEl.classList.add('system');
        } else {
          const scraped = detectTodoUpdate(S.currentAgentText);
          if (scraped) showPlan(scraped);
        }
        renderMarkdown(S.currentAgentEl, S.currentAgentText);
        autoScroll();
      }
      // YOLO state feedback — parse the adapter's /yolo response ("⚡ YOLO mode: ON — ..."
      // or "⚠ YOLO mode: OFF — ...") and toggle the red composer glow. Ground-truth
      // driven: the glow reflects the real HERMES_YOLO_MODE env var inside the
      // adapter subprocess, not an optimistic client guess.
      {
        const m = /YOLO mode:\s*(ON|OFF)/i.exec(S.currentAgentText);
        if (m) composer.classList.toggle('yolo', m[1].toUpperCase() === 'ON');
      }
      S.currentAgentEl = null; S.currentAgentText = ''; S.thinkingStatusEl = null;
      S.pendingSlashResponse = false;
      inputEl.focus();
      break;

    case 'error':
      if (S.pendingText) flushPending();
      if (S.markdownDebounceTimer) { clearTimeout(S.markdownDebounceTimer); S.markdownDebounceTimer = null; }
      document.getElementById('waiting')?.remove();
      document.getElementById('turn-thinking')?.remove();
      appendMessage(messagesEl, 'error', `Error: ${msg.text}`);
      S.currentAgentEl = null; S.currentAgentText = ''; S.thinkingStatusEl = null;
      break;

    case 'status':
      if (msg.status === 'connecting')       appendMessage(messagesEl, 'tool', 'Connecting to Hermes…');
      else if (msg.status === 'connected')   appendMessage(messagesEl, 'tool', 'Connected');
      else if (msg.status === 'disconnected') {
        appendMessage(messagesEl, 'error', 'Hermes disconnected');
        setBusy(false);
      }
      break;

    case 'notice': {
      const notice = appendDiv(messagesEl, 'status-line');
      notice.textContent = msg.text ?? '';
      autoScroll();
      break;
    }

    case 'clear':
      messagesEl.innerHTML = '';
      S.pendingQueuedMessages = []; S.prevQueueCount = 0; S.knownContextSize = 0; S.flushScheduled = false;
      S.currentContextUsed = undefined; S.currentCompressionCount = undefined;
      S.agentActivities = []; S.availableCommands = [];
      S.editingQueuedRequestId = undefined;
      ctxBarWrap.style.display = 'none';
      S.currentAgentEl = null; S.currentAgentText = ''; S.thinkingStatusEl = null; S.pendingText = '';
      setBusy(false);
      statusContextEl.textContent = ''; statusContextEl.className = '';
      backgroundProcessStatus.className = ''; backgroundProcessStatus.innerHTML = '';
      buildSlashCommandMenu(overflowMenu, S.availableCommands);
      renderAgentBar();
      break;

    case 'mentionSuggestions': {
      // Drop a reply that arrived after the query moved on, once the picker
      // closed, or while a slash palette is showing — otherwise a slow file
      // lookup reopens a stale menu or overwrites the command list.
      if (!mentionOpen || mentionKind !== 'mention' || msg.query !== mentionQuery) break;
      mentionItems = msg.mentionSuggestions ?? [];
      mentionSelected = 0;
      paintMentionMenu();
      break;
    }

    case 'modeState': {
      modeOptions = msg.modeOptions ?? [];
      activeModeId = msg.activeMode ?? '';
      modeBtnLabel.textContent = modeButtonLabel(modeOptions, activeModeId);
      // Drives the dot colour: the CSS keys off this attribute.
      modeBtn.dataset.mode = activeModeId;
      // Keep an open menu in sync rather than showing a stale checkmark.
      if (modeMenu.style.display === 'block') {
        modeMenu.innerHTML = renderModeMenu(modeOptions, activeModeId);
      }
      break;
    }

    case 'modelGroups': {
      // ACP advertised the real inventory; replace the menu that was baked in
      // from the offline fallback, then re-resolve the active option so the
      // header label matches a node that now exists.
      const markup = renderModelMenu(msg.modelGroups ?? [], S.currentModel ?? '');
      if (markup) {
        modelMenu.innerHTML = markup;
        updateStatusBar(S, statusEls, S.currentModel);
      }
      break;
    }

    case 'statusBar': {
      updateStatusBar(S, statusEls, msg.model, msg.sessionTitle, msg.contextUsed, msg.contextSize, msg.version, msg.cachedTokens);
      if (msg.compressionCount !== undefined) S.currentCompressionCount = msg.compressionCount;
      if (msg.availableCommands !== undefined) {
        S.availableCommands = msg.availableCommands.map(command => ({ ...command }));
        buildSlashCommandMenu(overflowMenu, S.availableCommands);
      }
      if (msg.agentActivities !== undefined) {
        S.agentActivities = msg.agentActivities.map(activity => ({ ...activity }));
      }
      renderAgentBar();
      if (msg.skillGroups && msg.skillGroups.length > 0) S.skillGroupsData = msg.skillGroups;
      if (msg.selectedSkills !== undefined) {
        S.selectedSkillNames = new Set(msg.selectedSkills);
        skillsBtn.classList.toggle('has-skills', S.selectedSkillNames.size > 0);
        skillsBtn.textContent = S.selectedSkillNames.size > 0 ? `✦${S.selectedSkillNames.size}` : '✦';
      }
      if (msg.backgroundProcesses !== undefined) {
        const processes = msg.backgroundProcesses;
        if (processes.length > 0) {
          const ids = processes.map(process => process.id).join(', ');
          backgroundProcessStatus.className = 'active';
          backgroundProcessStatus.replaceChildren();
          const dot = document.createElement('span'); dot.className = 'process-dot';
          const label = document.createElement('span'); label.className = 'process-label'; label.textContent = 'Background work active';
          const idList = document.createElement('span'); idList.className = 'process-ids'; idList.textContent = ids;
          backgroundProcessStatus.append(dot, label, idList);
        } else {
          backgroundProcessStatus.className = '';
          backgroundProcessStatus.innerHTML = '';
        }
      }
      if (msg.todoState && typeof msg.todoState === 'object') {
        const state = msg.todoState as { todos?: TodoItem[] };
        if (state.todos) showPlan(state.todos);
      }
      if (msg.contextAnnotation) {
        const userMsgs = messagesEl.querySelectorAll('.msg.user');
        const lastUser = userMsgs[userMsgs.length - 1];
        if (lastUser) {
          const anno = document.createElement('div');
          anno.className = 'context-annotation';
          anno.innerHTML = DOMPurify.sanitize(msg.contextAnnotation, {
            ALLOWED_TAGS: ['span'], ALLOWED_ATTR: ['class'],
          });
          lastUser.appendChild(anno);
        }
      }
      if (msg.attachedFiles !== undefined) {
        if (msg.attachedFiles && msg.attachedFiles.length > 0) {
          attachChip.innerHTML = msg.attachedFiles.map((f: {name: string}) =>
            `⊕ <span class="chip-name">${f.name}</span>`
          ).join(' ') + ' <span class="chip-x">✕</span>';
          attachChip.style.display = 'flex';
        } else {
          attachChip.style.display = 'none'; attachChip.innerHTML = '';
        }
      }
      break;
    }

    case 'profileList': {
      S.currentProfile = msg.profile ?? '';
      S.profileRestartRequired = !!msg.restartRequired;
      const activeProfileItem = msg.profileItems?.find(item => item.active);
      profileLabelEl.textContent = activeProfileItem?.label ?? (S.currentProfile || 'Default');
      profileBtnHeader.classList.toggle('restart-required', S.profileRestartRequired);
      profileBtnHeader.title = S.profileRestartRequired
        ? 'Switch Hermes profile (restart required to apply current selection)'
        : 'Switch Hermes profile';
      buildProfileMenu(profileMenu, msg.profileItems ?? [], S.profileRestartRequired);
      break;
    }

    case 'sessionList':
      if (msg.sessions && msg.activeSessionId !== undefined) {
        buildSessionPicker(sessionPicker, msg.sessions, msg.activeSessionId, statusSessionEl, S);
      }
      break;

    case 'loadHistory':
      loadHistory(messagesEl, msg.history ?? [], msg.switched ?? false);
      break;
  }
});

// Replace arbitrary initialization delays with an explicit host handshake. The
// host replies with queueState before enabling submission controls.
vscode.postMessage({ type: 'ready' });
