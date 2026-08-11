# Migration from the original Marketplace extension

Status: Successor `stefanpieter.hermes-ai-agent-maintained@3.6.0` is published and publicly available; coexistence guard and non-migrating-state limitations are accepted for the initial release.

## Identities

Original extension:

- Marketplace publisher: `joaompfp`
- Extension name: `hermes-ai-agent`
- Full extension ID: `joaompfp.hermes-ai-agent`

Successor identity:

- Marketplace publisher: `stefanpieter`
- Extension name: `hermes-ai-agent-maintained`
- Full extension ID: `stefanpieter.hermes-ai-agent-maintained`
- Display name: `Hermes AI Agent (Maintained)`

## Why migration is required

VS Code scopes `ExtensionContext.workspaceState`, `globalState`, and storage directories to an extension identity. The chat panel currently stores workspace conversations under `hermes.sessions` in `workspaceState`. A newly published successor ID will therefore not automatically see the original extension's stored UI conversations even if both versions use the same key.

The `hermes.*` configuration keys normally remain in VS Code settings after uninstall and may be reused where their meaning is unchanged. That does not migrate extension-scoped state or executable approvals.

The original and successor extensions also cannot safely run together while they contribute overlapping command, view, and configuration IDs.

## Recommended transition

1. Keep the maintained successor installed.
2. Before removing the original, open it and manually preserve any original-extension UI conversation content you still need. There is no owner-authorised exporter for the original Marketplace identity.
3. Wait until no valuable ACP turn or background process is running.
4. Uninstall `joaompfp.hermes-ai-agent` from VS Code.
5. Reload the VS Code window and use `stefanpieter.hermes-ai-agent-maintained` as the sole Hermes extension.
6. Confirm the retained `hermes.*` settings and approve the selected Hermes executable again if prompted.

Do not leave both extensions installed for normal use. The successor intentionally fails closed while it detects the original extension, so keeping both prevents the maintained extension from activating.

### Rollback

If the successor blocks required work, stop active ACP/background activity, uninstall or disable the successor, reinstall the original extension if necessary, and reload VS Code. Do not run both extensions concurrently. Rollback may restore access to original-extension-scoped UI state if VS Code retained it, but this is not guaranteed; Hermes Agent's separately persisted runtime sessions are not deleted by removing either VS Code extension.

## Migration design record

### Preferred: existing-ID handover

If repository and Marketplace publishing access are transferred, retain the existing extension identity and ship a normal tested update. No cross-extension state migration is required, but schema migrations still require tests.

### Potential future bridge: explicit export and import

An export/import bridge remains possible only if the original publisher authorises a bridge release:

1. Add an explicit `Export Hermes Conversations` command to a bridge build using the original extension identity.
2. Export a versioned JSON document selected by the user.
3. Include only the extension's conversation/session metadata and messages needed for import.
4. Exclude secrets, Marketplace tokens, executable approvals, environment variables, and unrelated VS Code state.
5. Warn that prompts and tool output may contain sensitive source or personal data.
6. Validate and escape all imported data in the successor.
7. Add `Import Hermes Conversations` to the successor, with duplicate/conflict handling and a preview before mutation.
8. Preserve the export file so rollback remains possible.

Marketplace users can receive an exporter under the original identity only through an owner-authorised update or explicitly private compatibility test. The maintained fork must not publicly distribute a bridge VSIX that claims the original identity. If no authorised exporter is available, the successor release decision must state exactly which conversation data cannot migrate and obtain explicit maintainer approval rather than directing users to alter VS Code's internal database.

## Coexistence policy

The successor detects `joaompfp.hermes-ai-agent` before registering commands, views, state writers, or starting ACP. If the original extension remains installed, successor activation fails closed and presents disable/uninstall and reload guidance.

A successor release must use distinct extension, command, and view identifiers where coexistence cannot be prevented by VS Code. Configuration keys may remain `hermes.*` only after testing that uninstall/install and temporary coexistence do not corrupt settings.

## Test matrix

- macOS, Linux, and Windows
- local, Remote SSH, WSL, and dev-container workspaces where supported
- empty workspace, single-folder workspace, multi-root workspace
- original Marketplace 3.0.0 to bridge to successor
- maintained local 3.3.0 to bridge to successor
- no saved conversations
- multiple sessions with queued messages and ACP IDs
- duplicate import, malformed JSON, oversized export, and interrupted import
- successor rollback to the original or previous successor release
- exact-ID coexistence guard with the original installed and absent

## Non-goals

- Do not modify VS Code's private `state.vscdb` directly as the supported migration path.
- Do not copy secrets or executable approvals across identities.
- Do not promise that a stored ACP session remains resumable unless Hermes Agent still retains it and live resume has been verified.
- Do not silently remove the original extension.

## Initial release decision

Version `3.6.0` was published after coexistence prevention, security review, workload-identity publication, isolated install/rollback checks, and explicit maintainer acceptance of these limitations:

- VS Code UI conversation history stored as `hermes.sessions` does not carry over;
- trusted-executable approvals stored as `hermes.approvedBinaries` do not carry over and must be granted again;
- existing `hermes.*` settings remain available, but extension-scoped state does not;
- Hermes Agent may still retain underlying ACP sessions, but the successor does not promise that the old UI entries remain discoverable or resumable.
