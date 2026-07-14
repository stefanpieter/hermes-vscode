import type { BackgroundProcessState, ToWebview } from './types';

export function sessionSwitchUiMessages(
  sessionTitle: string,
  backgroundProcesses: BackgroundProcessState[],
): ToWebview[] {
  return [
    { type: 'clear' },
    { type: 'statusBar', sessionTitle, backgroundProcesses },
  ];
}
