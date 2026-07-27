import type { BackgroundProcessState, ToWebview } from './types';
import type { AgentActivity } from './agentActivity';
import type { AvailableSlashCommand } from './slashCommands';

export interface SessionContextUsage {
  contextUsed?: number;
  contextSize?: number;
  cachedTokens?: number;
  compressionCount?: number;
}

export function sessionReadyUiMessages(
  backgroundProcesses: BackgroundProcessState[],
  agentActivities?: AgentActivity[],
  availableCommands?: AvailableSlashCommand[],
  contextUsage?: SessionContextUsage,
): ToWebview[] {
  return [
    {
      type: 'statusBar',
      backgroundProcesses,
      ...(agentActivities ? { agentActivities } : {}),
      ...(availableCommands ? { availableCommands } : {}),
      ...contextUsage,
    },
  ];
}

export function sessionSwitchUiMessages(
  sessionTitle: string,
  backgroundProcesses: BackgroundProcessState[],
  agentActivities?: AgentActivity[],
  availableCommands?: AvailableSlashCommand[],
  contextUsage?: SessionContextUsage,
): ToWebview[] {
  return [
    { type: 'clear' },
    {
      type: 'statusBar',
      sessionTitle,
      backgroundProcesses,
      ...(agentActivities ? { agentActivities } : {}),
      ...(availableCommands ? { availableCommands } : {}),
      ...contextUsage,
    },
  ];
}
