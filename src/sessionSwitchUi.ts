import type { BackgroundProcessState, ToWebview } from './types';

export function sessionReadyUiMessages(
  backgroundProcesses: BackgroundProcessState[],
): ToWebview[] {
  return [
    { type: 'statusBar', backgroundProcesses },
  ];
}

export function sessionSwitchUiMessages(
  sessionTitle: string,
  backgroundProcesses: BackgroundProcessState[],
): ToWebview[] {
  return [
    { type: 'clear' },
    { type: 'statusBar', sessionTitle, backgroundProcesses },
  ];
}
