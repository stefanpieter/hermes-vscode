export interface SelectedPermissionResponse {
  outcome: {
    outcome: 'selected';
    optionId: string;
  };
}

export function selectedPermissionResponse(optionId: string): SelectedPermissionResponse {
  return {
    outcome: {
      outcome: 'selected',
      optionId,
    },
  };
}
