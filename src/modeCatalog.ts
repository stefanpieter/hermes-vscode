/**
 * Edit-approval modes advertised by ACP.
 *
 * `editApprovalMode.ts` holds the built-in table, which matches what Hermes
 * ships today. ACP also sends `SessionModeState` on session/new, and that is
 * authoritative: it stays correct when Hermes adds, renames, or removes a mode.
 * The built-in list is the fallback for the window before the first session
 * replies.
 */

import { EDIT_APPROVAL_MODES, EditApprovalModeOption } from './editApprovalMode';

/** One entry of ACP's `SessionModeState.available_modes`. */
export interface AcpModeInfo {
  id?: string;
  name?: string;
  description?: string;
}

/** ACP `SessionModeState`, sent on session/new and session/load. */
export interface AcpModeState {
  availableModes?: AcpModeInfo[];
  currentModeId?: string;
}

/**
 * Choose which mode list the picker shows.
 *
 * Advertised modes win outright when present; they are never merged with the
 * built-in table, since merging would resurrect a mode the server no longer
 * offers. Entries without an id are dropped — the id is what `session/set_mode`
 * is called with, so an empty one is unusable.
 */
export function resolveModeOptions(
  state: AcpModeState | undefined,
): readonly EditApprovalModeOption[] {
  const advertised = (state?.availableModes ?? [])
    .map(mode => {
      const id = (mode.id ?? '').trim();
      if (!id) {
        return undefined;
      }
      return {
        id: id as EditApprovalModeOption['id'],
        label: (mode.name ?? '').trim() || id,
        description: (mode.description ?? '').trim(),
      };
    })
    .filter((mode): mode is EditApprovalModeOption => mode !== undefined);

  return advertised.length > 0 ? advertised : EDIT_APPROVAL_MODES;
}
