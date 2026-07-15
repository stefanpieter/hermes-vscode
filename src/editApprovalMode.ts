export type EditApprovalModeId = 'default' | 'accept_edits' | 'dont_ask';

export interface EditApprovalModeOption {
  id: EditApprovalModeId;
  label: string;
  description: string;
}

export const EDIT_APPROVAL_MODES: readonly EditApprovalModeOption[] = [
  {
    id: 'default',
    label: 'Default',
    description: 'Ask before every file edit.',
  },
  {
    id: 'accept_edits',
    label: 'Accept Edits',
    description: 'Auto-allow workspace and temporary-file edits; still ask for sensitive paths.',
  },
  {
    id: 'dont_ask',
    label: "Don't Ask",
    description: 'Auto-allow file edits for the session except sensitive paths.',
  },
];

const EDIT_APPROVAL_MODE_IDS = new Set<EditApprovalModeId>(
  EDIT_APPROVAL_MODES.map(mode => mode.id),
);

export function normalizeEditApprovalMode(value: unknown): EditApprovalModeId {
  return typeof value === 'string' && EDIT_APPROVAL_MODE_IDS.has(value as EditApprovalModeId)
    ? value as EditApprovalModeId
    : 'default';
}

export function editApprovalModeLabel(mode: EditApprovalModeId): string {
  return EDIT_APPROVAL_MODES.find(option => option.id === mode)?.label ?? 'Default';
}
