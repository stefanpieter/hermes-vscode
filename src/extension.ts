import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { AcpClient } from './acpClient';
import { normalizeHermesProfile } from './acpLaunchArgs';
import { buildProfileMenuItems, isProfileRestartRequired, parseHermesProfileList, profileDisplayName } from './profileUi';
import { PermissionRequestHandler, SessionManager } from './sessionManager';
import { ChatPanelProvider } from './chatPanel';
import { selectedPermissionResponse } from './permissionResponse';
import { applyProfileSelection } from './profileSelection';

const DEFAULT_SONNET_MODEL = 'claude-sonnet-4-6';
const APPROVED_BINARIES_KEY = 'hermes.approvedBinaries';

function extractModelFromHermesConfig(content: string): string | null {
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const modelMatch = /^(\s*)model:\s*(.*)$/.exec(line);
    if (!modelMatch) continue;

    const modelIndent = modelMatch[1].length;
    const inlineValue = modelMatch[2].trim();
    if (inlineValue) {
      return inlineValue;
    }

    for (let j = i + 1; j < lines.length; j += 1) {
      const childLine = lines[j];
      if (!childLine.trim() || childLine.trimStart().startsWith('#')) continue;

      const childIndent = childLine.match(/^\s*/)?.[0].length ?? 0;
      if (childIndent <= modelIndent) break;

      const defaultMatch = /^\s*default:\s*(\S+)/.exec(childLine);
      if (defaultMatch) {
        return defaultMatch[1];
      }
    }
  }

  return null;
}

function readHermesModel(): { model: string; source: 'env' | 'config' | 'fallback' } {
  try {
    const configPath = path.join(os.homedir(), '.hermes', 'config.yaml');
    const content = fs.readFileSync(configPath, 'utf8');
    const model = extractModelFromHermesConfig(content);
    if (model) {
      return { model, source: 'config' };
    }
  } catch {
    // Fall through to the built-in Sonnet default.
  }

  return { model: DEFAULT_SONNET_MODEL, source: 'fallback' };
}

function readHermesVersion(hermesPath: string): string {
  try {
    const output = execFileSync(hermesPath, ['--version'], {
      timeout: 5000,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${path.dirname(hermesPath)}:${process.env.PATH ?? ''}` },
    });
    const match = output.match(/v(\d+\.\d+\.\d+)/);
    return match?.[1] ? `v${match[1]}` : '';
  } catch {
    return '';
  }
}

function readConfiguredHermesPath(): { value: string; workspaceOverrideIgnored: boolean } {
  const hermesConfig = vscode.workspace.getConfiguration('hermes');
  const inspected = hermesConfig.inspect<string>('path');
  const workspaceOverrideIgnored = !!(inspected?.workspaceValue || inspected?.workspaceFolderValue);
  const value = inspected?.globalValue ?? inspected?.defaultValue ?? 'hermes';
  return { value, workspaceOverrideIgnored };
}

function readConfiguredHermesProfile(): { value: string; workspaceOverrideIgnored: boolean } {
  const hermesConfig = vscode.workspace.getConfiguration('hermes');
  const inspected = hermesConfig.inspect<string>('profile');
  const workspaceOverrideIgnored = !!(inspected?.workspaceValue || inspected?.workspaceFolderValue);
  const value = normalizeHermesProfile(inspected?.globalValue ?? inspected?.defaultValue ?? '');
  return { value, workspaceOverrideIgnored };
}

function profileLabel(profile: string, defaultProfileName = ''): string {
  const displayName = profileDisplayName(profile, defaultProfileName);
  return profile ? `profile ${displayName}` : `default profile (${displayName})`;
}

function readDefaultHermesProfileName(): string {
  try {
    return fs.readFileSync(path.join(os.homedir(), '.hermes', 'default_profile_name'), 'utf8').trim();
  } catch {
    return '';
  }
}

function profileRestartRequired(client: AcpClient | null): boolean {
  return isProfileRestartRequired(!!client?.running, client?.selectedProfile ?? '', client?.launchedProfile ?? '');
}

function buildProfileState(hermesPath: string, currentProfile: string, restartRequired: boolean, defaultProfileName = '') {
  const profiles = readAvailableHermesProfiles(hermesPath);
  if (currentProfile && !profiles.includes(currentProfile)) profiles.push(currentProfile);
  return {
    profile: currentProfile,
    profileItems: buildProfileMenuItems(profiles, currentProfile, defaultProfileName),
    restartRequired,
  };
}

function readAvailableHermesProfiles(hermesPath: string): string[] {
  try {
    const output = execFileSync(hermesPath, ['profile', 'list'], {
      timeout: 5000,
      encoding: 'utf8',
      env: { ...process.env, PATH: `${path.dirname(hermesPath)}:${process.env.PATH ?? ''}` },
    });
    return parseHermesProfileList(output);
  } catch {
    return [];
  }
}

function resolveHermesBinary(configuredPath: string): string {
  let hermesPath = configuredPath;

  if (hermesPath !== 'hermes' && !path.isAbsolute(hermesPath)) {
    throw new Error('hermes.path must be an absolute path or the default "hermes" value');
  }

  if (hermesPath === 'hermes') {
    try {
      const resolved = execFileSync('which', ['hermes'], { timeout: 3000, encoding: 'utf8' }).trim();
      if (resolved) hermesPath = resolved;
    } catch {
      // not in PATH
    }

    if (hermesPath === 'hermes') {
      const tryPaths = [
        path.join(os.homedir(), '.local', 'bin', 'hermes'),
        '/usr/local/bin/hermes',
        '/usr/bin/hermes',
      ];
      for (const candidate of tryPaths) {
        try {
          if (fs.existsSync(candidate)) {
            hermesPath = candidate;
            break;
          }
        } catch {
          // skip unreadable candidate
        }
      }
    }
  }

  if (!path.isAbsolute(hermesPath)) {
    throw new Error(`Unable to resolve hermes binary from setting "${configuredPath}"`);
  }
  if (!fs.existsSync(hermesPath)) {
    throw new Error(`Configured hermes binary does not exist: ${hermesPath}`);
  }

  return hermesPath;
}

async function ensureTrustedBinary(
  context: vscode.ExtensionContext,
  hermesPath: string,
): Promise<boolean> {
  const approved = context.globalState.get<string[]>(APPROVED_BINARIES_KEY, []);
  if (approved.includes(hermesPath)) return true;

  const allow = 'Allow';
  const choice = await vscode.window.showWarningMessage(
    `Hermes wants to launch this local binary:\n${hermesPath}\n\nOnly allow binaries you trust.`,
    { modal: true },
    allow,
  );
  if (choice !== allow) return false;

  await context.globalState.update(APPROVED_BINARIES_KEY, [...new Set([...approved, hermesPath])]);
  return true;
}

function summarizePermissionRequest(params: unknown): string {
  if (!params || typeof params !== 'object') return 'Hermes requested permission for an action.';
  const record = params as Record<string, unknown>;
  const toolName = typeof record.toolName === 'string'
    ? record.toolName
    : typeof record.title === 'string'
      ? record.title
      : typeof record.kind === 'string'
        ? record.kind
        : 'an action';
  const reason = typeof record.reason === 'string'
    ? record.reason
    : typeof record.description === 'string'
      ? record.description
      : '';
  return reason
    ? `Hermes requested permission for ${toolName}: ${reason}`
    : `Hermes requested permission for ${toolName}.`;
}

function optionIdByIntent(params: unknown, intent: 'allow' | 'deny'): string | null {
  if (!params || typeof params !== 'object') return null;
  const options = (params as { options?: Array<Record<string, unknown>> }).options;
  if (!Array.isArray(options)) return null;

  const preferredAllow = ['allow_once', 'allow', 'approve', 'yes'];
  const preferredDeny = ['deny_once', 'deny', 'reject', 'no'];
  const preferred = intent === 'allow' ? preferredAllow : preferredDeny;

  for (const keyword of preferred) {
    const match = options.find((option) => {
      const id = typeof option.optionId === 'string' ? option.optionId : typeof option.id === 'string' ? option.id : '';
      return id.toLowerCase().includes(keyword);
    });
    if (match) {
      return (typeof match.optionId === 'string' ? match.optionId : match.id) as string;
    }
  }

  if (intent === 'allow') {
    const fallback = options.find((option) => {
      const id = typeof option.optionId === 'string' ? option.optionId : typeof option.id === 'string' ? option.id : '';
      return id && !/deny|reject|no/i.test(id);
    });
    return (typeof fallback?.optionId === 'string' ? fallback.optionId : fallback?.id as string | undefined) ?? null;
  }

  return null;
}

let client: AcpClient | null = null;
let outputChannel: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  outputChannel = vscode.window.createOutputChannel('Hermes');
  context.subscriptions.push(outputChannel);

  const configuredHermes = readConfiguredHermesPath();
  if (configuredHermes.workspaceOverrideIgnored) {
    outputChannel.appendLine('[security] Ignoring workspace-scoped hermes.path override');
  }

  let hermesPath = configuredHermes.value;
  const configuredProfile = readConfiguredHermesProfile();
  if (configuredProfile.workspaceOverrideIgnored) {
    outputChannel.appendLine('[security] Ignoring workspace-scoped hermes.profile override');
  }
  let hermesProfile = configuredProfile.value;
  let defaultProfileName = readDefaultHermesProfileName();

  outputChannel.appendLine(`[hermes] homedir: ${os.homedir()}`);
  outputChannel.appendLine(`[hermes] platform: ${process.platform}`);
  try {
    hermesPath = resolveHermesBinary(hermesPath);
    outputChannel.appendLine(`[hermes] binary: ${hermesPath}`);
    outputChannel.appendLine(`[hermes] ${profileLabel(hermesProfile, defaultProfileName)}`);
  } catch (err) {
    outputChannel.appendLine(`[security] invalid Hermes binary: ${err}`);
  }

  const hermesConfig = vscode.workspace.getConfiguration('hermes');
  const debugLogs = hermesConfig.get<boolean>('debugLogs', false);

  client = new AcpClient(
    hermesPath,
    debugLogs ? { HERMES_LOG_LEVEL: 'DEBUG' } : {},
    debugLogs,
    hermesProfile,
  );

  if (debugLogs) {
    outputChannel.show(true);
    outputChannel.appendLine('[hermes] ACP diagnostic logging enabled');
  }

  client.on('log', (line: string) => outputChannel.appendLine(line));
  client.on('exit', (code: number) => {
    outputChannel.appendLine(`[hermes acp exited: code ${code}]`);
    setStatus('disconnected');
  });

  const permissionHandler: PermissionRequestHandler = async (_method, params) => {
    const allowOptionId = optionIdByIntent(params, 'allow');
    const denyOptionId = optionIdByIntent(params, 'deny');
    const allow = 'Allow Once';
    const deny = 'Deny';
    const choice = await vscode.window.showWarningMessage(
      summarizePermissionRequest(params),
      { modal: true },
      allow,
      deny,
    );

    if (choice === allow && allowOptionId) {
      outputChannel.appendLine('[security] permission granted once');
      return selectedPermissionResponse(allowOptionId);
    }

    if (denyOptionId) {
      outputChannel.appendLine('[security] permission denied');
      return selectedPermissionResponse(denyOptionId);
    }

    throw new Error('Permission denied by user');
  };

  const session = new SessionManager(client, line => outputChannel.appendLine(line), permissionHandler);
  const { model: hermesModel } = readHermesModel();
  const hermesVersion = readHermesVersion(hermesPath);
  const applySelectedProfile = async (nextProfile: string, source: string) => {
    const result = await applyProfileSelection(nextProfile, {
      currentProfile: () => hermesProfile,
      persistProfile: async profile => {
        await vscode.workspace.getConfiguration('hermes').update('profile', profile, vscode.ConfigurationTarget.Global);
      },
      setCurrentProfile: profile => { hermesProfile = profile; },
      setClientProfile: profile => { client?.setProfile(profile); },
      isClientRunning: () => client?.running ?? false,
      stopClient: () => { client?.stop(); },
      resetSession: () => { session.reset(); },
      ensureConnected,
      setDisconnected: () => { setStatus('disconnected'); },
    });
    if (result.changed) {
      outputChannel.appendLine(`[hermes] selected ${profileLabel(result.profile, defaultProfileName)} from ${source}`);
    }
    return result;
  };
  const panel = new ChatPanelProvider(
    context.extensionUri,
    session,
    hermesModel,
    hermesVersion,
    context,
    line => outputChannel.appendLine(line),
    {
      currentProfile: () => hermesProfile,
      profileItems: () => buildProfileState(hermesPath, hermesProfile, profileRestartRequired(client), defaultProfileName).profileItems,
      restartRequired: () => profileRestartRequired(client),
      selectProfile: async (nextProfile: string) => {
        const result = await applySelectedProfile(nextProfile, 'webview');
        return result.restarted;
      },
      customProfile: async () => {
        const typed = await vscode.window.showInputBox({
          prompt: 'Hermes profile name. Leave empty for default profile.',
          value: hermesProfile,
        });
        if (typed === undefined) return false;
        const result = await applySelectedProfile(typed, 'webview');
        return result.restarted;
      },
      restartHermes: async () => {
        if (!client?.running) return;
        client.stop();
        session.reset();
        await ensureConnected();
      },
    },
  );

  context.subscriptions.push(
    panel,
    vscode.window.registerWebviewViewProvider(ChatPanelProvider.viewId, panel, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand('hermes.openChat', async () => {
      outputChannel.appendLine('[ui] open chat');
      await vscode.commands.executeCommand('hermes.chatView.focus');
      await ensureConnected();
    }),

    vscode.commands.registerCommand('hermes.restartAgent', async () => {
      outputChannel.appendLine('[hermes] restarting ACP from command palette');
      if (client?.running) client.stop();
      session.reset();
      panel.post({ type: 'clear' });
      await ensureConnected();
      vscode.window.showInformationMessage('Hermes Agent restarted.');
    }),

    vscode.commands.registerCommand('hermes.newSession', () => {
      outputChannel.appendLine('[ui] new session');
      session.reset();
      panel.post({ type: 'clear' });
    }),

    vscode.commands.registerCommand('hermes.selectProfile', async () => {
      outputChannel.appendLine('[ui] select profile');
      const profiles = readAvailableHermesProfiles(hermesPath);
      const picked = await vscode.window.showQuickPick(
        [
          { label: profileDisplayName('', defaultProfileName), description: 'Use Hermes current/default profile', profile: '' },
          ...profiles.map(profile => ({ label: profile, description: 'Hermes profile', profile })),
          { label: '$(pencil) Enter custom profile…', description: 'Type a profile name manually', profile: undefined },
        ],
        { placeHolder: `Current: ${profileLabel(hermesProfile, defaultProfileName)}` },
      );
      if (!picked) return;

      let nextProfile = picked.profile;
      if (nextProfile === undefined) {
        const typed = await vscode.window.showInputBox({
          prompt: 'Hermes profile name. Leave empty for default profile.',
          value: hermesProfile,
        });
        if (typed === undefined) return;
        nextProfile = typed;
      }

      nextProfile = normalizeHermesProfile(nextProfile);
      const result = await applySelectedProfile(nextProfile, 'command palette');
      if (!result.changed) return;
      if (result.restarted) panel.post({ type: 'clear' });
      panel.refreshProfileState();
    }),
  );

  // Status bar
  const statusItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  statusItem.text = `$(circle-outline) Hermes: ${profileDisplayName(hermesProfile, defaultProfileName)}`;
  statusItem.command = 'hermes.openChat';
  statusItem.show();
  context.subscriptions.push(statusItem);

  function setStatus(state: 'connected' | 'disconnected' | 'connecting'): void {
    const icons: Record<string, string> = {
      connected: '$(circle-filled)',
      disconnected: '$(circle-outline)',
      connecting: '$(loading~spin)',
    };
    statusItem.text = `${icons[state]} Hermes: ${profileDisplayName(hermesProfile, defaultProfileName)}`;
    panel.post({ type: 'status', status: state });
    panel.refreshProfileState();
  }

  async function ensureConnected(): Promise<void> {
    if (!client) return;
    if (!vscode.workspace.isTrusted) {
      outputChannel.appendLine('[security] workspace is not trusted; Hermes launch blocked');
      setStatus('disconnected');
      void vscode.window.showWarningMessage('Hermes is disabled until this workspace is trusted.');
      return;
    }

    try {
      hermesPath = resolveHermesBinary(readConfiguredHermesPath().value);
      const configuredProfileNow = readConfiguredHermesProfile();
      if (configuredProfileNow.workspaceOverrideIgnored) {
        outputChannel.appendLine('[security] Ignoring workspace-scoped hermes.profile override');
      }
      hermesProfile = configuredProfileNow.value;
      defaultProfileName = readDefaultHermesProfileName();
    } catch (err) {
      setStatus('disconnected');
      vscode.window.showErrorMessage(`Hermes: invalid binary path — ${err}`);
      return;
    }

    const approved = await ensureTrustedBinary(context, hermesPath);
    if (!approved) {
      outputChannel.appendLine('[security] Hermes launch cancelled by user');
      setStatus('disconnected');
      return;
    }
    client.setHermesPath(hermesPath);
    client.setProfile(hermesProfile);

    outputChannel.appendLine('[acp] connecting');
    setStatus('connecting');
    try {
      await client.start();
      outputChannel.appendLine('[acp] connected');
      setStatus('connected');
    } catch (err) {
      outputChannel.appendLine(`[acp] connect failed: ${err}`);
      setStatus('disconnected');
      vscode.window.showErrorMessage(`Hermes: failed to start — ${err}`);
    }
  }

  // Auto-connect
  if (vscode.workspace.isTrusted) {
    void ensureConnected();
  } else {
    setStatus('disconnected');
  }
}

export function deactivate(): void {
  client?.stop();
}
